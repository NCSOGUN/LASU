#!/usr/bin/env node
/**
 * Build the self-contained API reference.
 *
 *   node docs/api/build.mjs
 *
 * Reads every docs/api/fixtures/*.json file, validates the capture contract,
 * merges the groups by order, and writes docs/api/index.html with the CSS, the
 * merged data, and the client script inline.
 */
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const fixtureDir = join(here, 'fixtures');
const templatePath = join(here, 'template.html');
const stylesPath = join(here, 'assets', 'styles.css');
const scriptPath = join(here, 'assets', 'app.js');
const outputPath = join(here, 'index.html');

const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
const REQUIRED_ENDPOINT = ['id', 'name', 'method', 'path', 'summary', 'auth', 'responses'];

const sampleGroups = [
  {
    name: 'Sample',
    description: 'Built-in preview. Add fixtures under docs/api/fixtures and rebuild.',
    endpoints: [
      {
        id: 'sample-directory-services',
        name: 'List services',
        method: 'GET',
        path: '/directory/services',
        summary: 'Return the active service catalogue.',
        description: 'Preview endpoint supplied by the generator when no fixtures exist.',
        auth: 'none',
        roles: [],
        contentType: 'none',
        pathParams: [],
        queryParams: [],
        bodyExample: null,
        bodyFields: [],
        responses: [
          {
            status: 200,
            label: 'OK',
            description: 'Active services.',
            headers: { 'content-type': 'application/json' },
            body: { services: [{ service_code: 'general', label: 'General care' }] },
          },
        ],
        curl: 'curl -sS http://localhost:3000/v1/directory/services',
        notes: [],
      },
    ],
  },
];

function fail(message) {
  console.error(`[api-docs] ${message}`);
  process.exit(1);
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeString(value, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function normalizeList(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeEndpoint(endpoint, file, seenIds) {
  if (!isObject(endpoint)) fail(`${file}: endpoint must be an object`);
  for (const field of REQUIRED_ENDPOINT) {
    if (endpoint[field] === undefined || endpoint[field] === null) {
      fail(`${file}: endpoint ${endpoint.id || '(missing id)'} is missing ${field}`);
    }
  }
  const id = normalizeString(endpoint.id).trim();
  if (!id) fail(`${file}: endpoint id is empty`);
  if (seenIds.has(id)) fail(`${file}: duplicate endpoint id "${id}"`);
  seenIds.add(id);

  const method = normalizeString(endpoint.method).toUpperCase();
  if (!METHODS.has(method)) fail(`${file}: ${id} has unsupported method ${method}`);

  const path = normalizeString(endpoint.path);
  if (!path.startsWith('/')) fail(`${file}: ${id} path must start with "/"`);

  const auth = normalizeString(endpoint.auth).toLowerCase() === 'bearer' ? 'bearer' : 'none';
  const responses = normalizeList(endpoint.responses);
  if (!responses.length) fail(`${file}: ${id} needs at least one response`);

  const normalizedResponses = responses.map((response, index) => {
    if (!isObject(response)) fail(`${file}: ${id} response ${index} must be an object`);
    if (!Number.isInteger(response.status)) {
      fail(`${file}: ${id} response ${index} needs an integer status`);
    }
    return {
      status: response.status,
      label: normalizeString(response.label) || String(response.status),
      description: normalizeString(response.description),
      headers: isObject(response.headers) ? response.headers : {},
      body: response.body === undefined ? null : response.body,
    };
  });

  return {
    id,
    name: normalizeString(endpoint.name),
    method,
    path,
    summary: normalizeString(endpoint.summary),
    description: normalizeString(endpoint.description),
    auth,
    roles: normalizeList(endpoint.roles).map((role) => String(role)),
    contentType: normalizeString(endpoint.contentType, auth === 'none' ? 'none' : 'application/json'),
    pathParams: normalizeList(endpoint.pathParams),
    queryParams: normalizeList(endpoint.queryParams),
    bodyExample: endpoint.bodyExample === undefined ? null : endpoint.bodyExample,
    bodyFields: normalizeList(endpoint.bodyFields),
    responses: normalizedResponses,
    curl: normalizeString(endpoint.curl),
    notes: normalizeList(endpoint.notes).map((note) => String(note)),
  };
}

function mergeGroups(fixtures) {
  const byName = new Map();
  for (const fixture of fixtures) {
    const groupName = normalizeString(fixture.group, 'Endpoints').trim() || 'Endpoints';
    if (!byName.has(groupName)) {
      byName.set(groupName, {
        name: groupName,
        description: normalizeString(fixture.description),
        order: Number.isFinite(fixture.order) ? fixture.order : 1000,
        endpoints: [],
      });
    }
    const group = byName.get(groupName);
    if (!group.description && fixture.description) group.description = fixture.description;
    group.endpoints.push(...fixture.endpoints);
  }
  return [...byName.values()].sort(
    (left, right) => left.order - right.order || left.name.localeCompare(right.name),
  );
}

function safeScriptJson(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function safeScriptText(value) {
  return value.replace(/<\/script/gi, '<\\/script');
}

function replaceOnce(source, token, value, label) {
  if (!source.includes(token)) fail(`template.html is missing ${label} (${token})`);
  return source.replace(token, () => value);
}

async function main() {
  const [template, styles, script] = await Promise.all([
    readFile(templatePath, 'utf8'),
    readFile(stylesPath, 'utf8'),
    readFile(scriptPath, 'utf8'),
  ]);

  let files = [];
  try {
    files = (await readdir(fixtureDir)).filter((file) => file.endsWith('.json')).sort();
  } catch {
    files = [];
  }

  const seenIds = new Set();
  const fixtures = [];
  for (const file of files) {
    const raw = await readFile(join(fixtureDir, file), 'utf8');
    let fixture;
    try {
      fixture = JSON.parse(raw);
    } catch (error) {
      fail(`${file}: invalid JSON (${error.message})`);
    }
    if (!isObject(fixture)) fail(`${file}: fixture must be an object`);
    if (!Array.isArray(fixture.endpoints) || fixture.endpoints.length === 0) {
      fail(`${file}: endpoints must be a non-empty array`);
    }
    fixture.endpoints = fixture.endpoints.map((endpoint) =>
      normalizeEndpoint(endpoint, file, seenIds),
    );
    fixtures.push(fixture);
  }

  const groups = fixtures.length ? mergeGroups(fixtures) : sampleGroups;
  const endpointCount = groups.reduce((total, group) => total + group.endpoints.length, 0);

  const data = {
    meta: {
      title: 'HealthAccess API',
      version: 'v1',
      generatedAt: new Date().toISOString(),
      sample: fixtures.length === 0,
      fixtureCount: fixtures.length,
      endpointCount,
    },
    groups: groups.map((group) => ({
      name: group.name,
      description: group.description,
      endpoints: group.endpoints,
    })),
  };

  let html = template;
  html = replaceOnce(html, '__HEALTHACCESS_STYLES__', styles, 'the styles placeholder');
  html = replaceOnce(html, '__HEALTHACCESS_DATA__', safeScriptJson(data), 'the data placeholder');
  html = replaceOnce(html, '__HEALTHACCESS_APP__', safeScriptText(script), 'the app placeholder');

  await writeFile(outputPath, html, 'utf8');

  const bytes = Buffer.byteLength(html, 'utf8');
  console.log(
    `[api-docs] wrote ${outputPath} (${endpointCount} endpoints, ${groups.length} groups, ${files.length} fixtures, ${(bytes / 1024).toFixed(1)} KiB)`,
  );
  if (fixtures.length === 0) {
    console.warn('[api-docs] no fixtures found; the page uses built-in sample data');
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
