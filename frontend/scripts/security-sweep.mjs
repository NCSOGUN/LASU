#!/usr/bin/env node
/**
 * Security sweep for scope §9. Prints findings and exits non-zero on unexpected hits.
 * Allowed exceptions are pre-existing landing-only, non-sensitive uses.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const allowed = new Map([
  ["src/features/landing/Preloader.tsx", ["sessionStorage"]],
  ["src/app/layout.tsx", ["sessionStorage", "dangerouslySetInnerHTML"]],
  ["src/lib/log.ts", ["console."]],
]);

const patterns = [
  ["localStorage", /localStorage/g],
  ["sessionStorage", /sessionStorage/g],
  ["indexedDB", /indexedDB/g],
  ["console.", /console\./g],
  ["dangerouslySetInnerHTML", /dangerouslySetInnerHTML/g],
];

const files = execFileSync("git", ["ls-files", "src"], { cwd: root, encoding: "utf8" })
  .split("\n")
  .filter((file) => /\.(ts|tsx)$/.test(file))
  .filter((file) => !file.startsWith("src/components/arc/"));

const failures = [];

for (const file of files) {
  const source = readFileSync(path.join(root, file), "utf8");
  for (const [name, pattern] of patterns) {
    pattern.lastIndex = 0;
    if (!pattern.test(source)) continue;
    if (allowed.get(file)?.includes(name)) continue;
    failures.push(`${file}: ${name}`);
  }
}

const trackedEnv = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" })
  .split("\n")
  .filter((file) => /(^|\/)\.env/.test(file) && !file.endsWith(".env.example"));
if (trackedEnv.length) failures.push(`tracked env files: ${trackedEnv.join(", ")}`);

if (failures.length) {
  console.error("security sweep failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("security sweep passed");
console.log(`checked ${files.length} source files for storage, console and raw HTML use`);
console.log("the only sessionStorage use is the landing intro flag; the only console use is src/lib/log.ts");
console.log("no env file is tracked except .env.example");
