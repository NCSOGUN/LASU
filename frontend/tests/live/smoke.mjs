/**
 * Live smoke: opt-in, never in CI by default. No writes and no AI calls.
 * Run against a started app: LIVE_BASE_URL=http://localhost:3000 npm run test:live
 *
 * Never prints bodies, cookies, patient codes or tokens.
 */
const base = (process.env.LIVE_BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const demoEmail = "demo.patient@example.test";
const demoPassword = "DemoPass123!";

function cookieHeader(jar) {
  return Object.entries(jar)
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

function absorbCookies(response, jar) {
  const cookies = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
  for (const cookie of cookies) {
    const [pair] = cookie.split(";");
    const index = pair.indexOf("=");
    if (index === -1) continue;
    const name = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    if (value) jar[name] = value;
    else delete jar[name];
  }
}

function fail(message) {
  console.error(`live smoke failed: ${message}`);
  process.exit(1);
}

async function call(path, init, jar) {
  return fetch(`${base}${path}`, {
    ...init,
    headers: {
      "X-HA-Client": "web",
      Origin: base,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(Object.keys(jar).length ? { Cookie: cookieHeader(jar) } : {}),
      ...(init?.headers ?? {}),
    },
  });
}

async function main() {
  const jar = {};

  const login = await call("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: demoEmail, password: demoPassword }),
  }, jar);
  if (login.status !== 200) fail(`login returned ${login.status}`);
  absorbCookies(login, jar);
  const loginBody = await login.json();
  if ("tokens" in loginBody) fail("login response exposed tokens");
  if (!jar.ha_at || !jar.ha_rt) fail("login did not set both cookies");

  const refresh = await call("/api/auth/refresh", { method: "POST" }, jar);
  if (refresh.status !== 204) fail(`refresh returned ${refresh.status}`);
  absorbCookies(refresh, jar);

  const session = await call("/api/auth/session", { method: "GET" }, jar);
  if (session.status !== 200) fail(`session returned ${session.status}`);
  const sessionBody = await session.json();
  if (!sessionBody.account?.id || !Array.isArray(sessionBody.roles)) fail("session response was incomplete");

  const fields = await call("/api/v1/me/fields", { method: "GET" }, jar);
  if (fields.status !== 200) fail(`/me/fields returned ${fields.status}`);

  const services = await call("/api/v1/directory/services", { method: "GET" }, jar);
  if (services.status !== 200) fail(`/directory/services returned ${services.status}`);

  const logout = await call("/api/auth/logout", { method: "POST" }, jar);
  if (logout.status !== 204) fail(`logout returned ${logout.status}`);
  absorbCookies(logout, jar);

  const after = await call("/api/auth/session", { method: "GET" }, jar);
  if (after.status !== 401) fail(`session after logout returned ${after.status}`);

  console.log("live smoke passed: login, refresh, /me, /me/fields, directory services, logout");
}

main().catch((error) => fail(error instanceof Error ? error.message : "unknown error"));
