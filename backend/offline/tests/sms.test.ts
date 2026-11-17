import test from 'node:test';
import assert from 'node:assert/strict';
import { createSmsEngine, isPotentiallyUrgent } from '../src/channels/sms.js';
import type { SmsRepository, SmsResult } from '../src/channels/sms.js';
import { smsSegments, renderFacility, renderWebLead } from '../src/channels/render.js';

const services = [
  { service_code: 'general', label: 'General care' },
  { service_code: 'pediatrics', label: 'Child health' },
];
function textOf(result: SmsResult) {
  const reply = result.replies[0];
  return reply.kind === 'text' ? reply.text : '';
}

function setup(overrides: Partial<SmsRepository> = {}) {
  const calls: string[] = [];
  const repository: SmsRepository = {
    listServices: async () => services,
    setOptOut: async () => {},
    findAreas: async () => [{ id: 'area1', name: 'Ikeja' }],
    findFacilities: async () => [
      { id: 'facility1', name: 'Example', address: 'Test', phone: null, distance_km: null },
    ],
    readEmergency: async () => ({
      available: true,
      fields: [{ key: 'allergies', label: 'Allergies', value: ['Test'] }],
    }),
    findProfileConsent: async () => null,
    readMatchingContext: async () => ({ available: false }),
    storeWebLeads: async () => ['lead1'],
    ...overrides,
  };
  return {
    calls,
    engine: createSmsEngine({
      repository,
      config: { searchRadiusKm: 25, allowLiveWeb: true, profileUseEnabled: false },
      crypto: { digestCode: () => 'digest' },
      assistant: {
        classify: async () => {
          calls.push('AI');
          return {
            intent: 'unsupported',
            service_code: null,
            location_query: null,
            question: null,
          };
        },
        answer: async () => ({ text: 'Safe fallback.' }),
      },
    }),
  };
}

test('deterministic FIND works without AI and prompts for missing area', async () => {
  const { engine, calls } = setup();
  const first = await engine.process('FIND child health');
  assert.equal(first.state, 'awaiting_area');
  const next = await engine.process('Ikeja', first);
  assert.equal(next.state, 'showing_results');
  assert.equal(next.replies[0].kind, 'facility');
  assert.equal(next.replies[0].kind === 'facility' && next.replies[0].id, 'facility1');
  assert.deepEqual(calls, []);
  assert.equal((await engine.process('FIND child health near Ikeja')).state, 'showing_results');
});

test('LOOKUP queues a digest render reference, never medical snapshots', async () => {
  const { engine, calls } = setup();
  const reply = await engine.process('LOOKUP 123456789012');
  assert.deepEqual(reply.replies, [{ kind: 'emergency', codeDigest: 'digest' }]);
  assert.equal(JSON.stringify(reply).includes('Test'), false);
  assert.deepEqual(calls, []);
  assert.match(textOf(await engine.process('LOOKUP 123')), /12-digit/);
});

test('code-like inputs never reach a model and urgency bypasses clarification', async () => {
  const { engine, calls } = setup();
  await engine.process('Please explain 12345678');
  const urgent = await engine.process('I cannot breathe', {
    state: 'awaiting_area',
    context: { serviceCode: 'general' },
  });
  assert.match(textOf(urgent), /immediate in-person/);
  assert.deepEqual(calls, []);
  assert.equal(isPotentiallyUrgent('I am suicidal'), true);
  const withPhone = await engine.process('I cannot breathe, call 08030000000');
  assert.match(textOf(withPhone), /immediate in-person/);
  assert.equal(isPotentiallyUrgent('I can\u2019t breathe'), true);
  assert.match(
    textOf(await engine.process('LOOKUP 123456789012 I cannot breathe')),
    /immediate in-person/,
  );
  assert.deepEqual(calls, []);
});

test('MORE needs a live result list; CANCEL clears transient context', async () => {
  const { engine } = setup();
  assert.match(textOf(await engine.process('MORE')), /no active result/);
  const cancelled = await engine.process('CANCEL', {
    state: 'awaiting_area',
    context: { serviceCode: 'general' },
  });
  assert.equal(cancelled.state, 'closed');
  assert.deepEqual(cancelled.context, {});
});

test('ambiguous locations require one offered choice; unlisted facilities are never invented', async () => {
  const { engine } = setup({
    findAreas: async () => [
      { id: 'a', name: 'Ikeja' },
      { id: 'b', name: 'Ikeja' },
    ],
  });
  const ambiguous = await engine.process('FIND general near Ikeja');
  assert.equal(ambiguous.state, 'awaiting_area_choice');
  assert.equal((await engine.process('9', ambiguous)).state, 'awaiting_area_choice');
  assert.equal((await engine.process('1', ambiguous)).state, 'showing_results');
});

test('rendering distinguishes verified directory from unverified leads and encoding budgets', () => {
  assert.match(
    renderFacility({ id: 'f', name: 'Example', address: 'Test', phone: null, distance_km: null }),
    /Distance unavailable/,
  );
  assert.match(
    renderWebLead({
      name: 'Example',
      address: 'Test',
      phone: null,
      source_url: 'https://example.org',
    }),
    /Unverified/,
  );
  assert.deepEqual(smsSegments('a'.repeat(160)), { encoding: 'GSM-7', segments: 1 });
  assert.equal(smsSegments('a'.repeat(161)).segments, 2);
  assert.equal(smsSegments('^'.repeat(81)).segments, 2);
  assert.deepEqual(smsSegments('\u4e2d'.repeat(71)), { encoding: 'UCS-2', segments: 2 });
});
