#!/usr/bin/env node
/**
 * Mobile Lighthouse for /app and /find-care.
 *
 * Usage:
 *   1. Start the built app: PORT=3212 npm run start
 *   2. LIGHTHOUSE_BASE_URL=http://127.0.0.1:3212 npm run lighthouse
 *
 * The demo account is public demo data. The access cookie is used only for the
 * Lighthouse run and is never printed, stored or committed.
 */
import { spawn } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";

const base = (process.env.LIGHTHOUSE_BASE_URL ?? "http://127.0.0.1:3212").replace(/\/+$/, "");
const outDir = path.resolve("test-results/lighthouse");
const demoEmail = "demo.patient@example.test";
const demoPassword = "DemoPass123!";

async function loginCookie() {
  const response = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-HA-Client": "web",
      Origin: base,
    },
    body: JSON.stringify({ email: demoEmail, password: demoPassword }),
  });
  if (!response.ok) throw new Error(`login returned ${response.status}`);

  const cookies = response.headers.getSetCookie();
  const access = cookies.find((cookie) => cookie.startsWith("ha_at="));
  if (!access) throw new Error("login did not set ha_at");
  return access.split(";")[0];
}

function runLighthouse(name, url, cookie) {
  return new Promise((resolve, reject) => {
    const extraHeaders = cookie ? JSON.stringify({ Cookie: cookie }) : "{}";
    const outputPath = path.join(outDir, `${name}-mobile`);
    const child = spawn(
      "npx",
      [
        "--yes",
        "lighthouse",
        url,
        "--quiet",
        "--output=json",
        "--output=html",
        `--output-path=${outputPath}`,
        "--only-categories=performance",
        "--form-factor=mobile",
        "--screenEmulation.mobile",
        "--throttling-method=simulate",
        "--chrome-flags=--headless=new --no-sandbox",
        `--extra-headers=${extraHeaders}`,
      ],
      { stdio: ["ignore", "inherit", "inherit"] },
    );
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve(outputPath) : reject(new Error(`lighthouse exited ${code}`))));
  });
}

async function report(name, outputPath) {
  const lhr = JSON.parse(await readFile(`${outputPath}.report.json`, "utf8"));
  const lcp = lhr.audits["largest-contentful-paint"]?.numericValue ?? 0;
  const cls = lhr.audits["cumulative-layout-shift"]?.numericValue ?? 0;
  const score = lhr.categories.performance?.score ?? 0;
  console.log(`${name}: performance ${Math.round(score * 100)} / LCP ${Math.round(lcp)} ms / CLS ${cls.toFixed(3)}`);
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const cookie = await loginCookie();

  const app = await runLighthouse("app", `${base}/app`, cookie);
  await report("/app", app);

  const care = await runLighthouse("find-care", `${base}/find-care`, null);
  await report("/find-care", care);
}

main().catch((error) => {
  console.error(`lighthouse failed: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exit(1);
});
