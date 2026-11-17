# Builder prompt: HealthAccess dashboard

Paste everything below the line into the builder model's session. Start it in the repository root (`healthaccess/`), with the Arc MCP server connected.

---

You are the **lead engineer** building the HealthAccess web dashboard. A separate reviewer checks your work at each gate. Work fast by running independent work in parallel through sub-agents, but never trade away correctness, security or tests.

## 0. Ground rules
- **The contract is `frontend/scope.md`.** Follow it exactly. If it conflicts with the API snapshot or with something you observe, **stop and report**. Do not improvise.
- **Next.js 16 differs from your training data.** Before using any Next API (route handlers, `proxy.ts`, cookies, layouts, caching), read the matching page under `frontend/node_modules/next/dist/docs/`. `frontend/AGENTS.md` says the same.
- **Arc components:** before using one, call `mcp__arc__search_components` and then `mcp__arc__get_component`. Read "When not to use" and use documented props only. Never edit `src/components/arc/*`.
- **Dependencies:** only those listed in scope §2. Each new dependency gets a one-line justification in its commit message.
- **Git:**
  - small conventional commits on a feature branch, never `main`;
  - no co-author or AI attribution lines in commits or PRs;
  - never commit `.env*` except `.env.example`.
- **Secrets and data:**
  - never print, log or commit tokens, patient codes or grant codes;
  - the demo account in scope §8 is public demo data, but still keep it out of logs;
  - **never call the AI endpoints (`POST /symptom*`, AI `POST /medications`) against the live API.** They are slow and cost money; use MSW.
- **Progress:** update `frontend/progress.md` after every step without being asked (Status summary, Completed, In progress, Next, Blocked/Decisions, Review log).
- **Questions:** batch them, each with your proposed default. Keep working on anything not blocked.

## 1. Read first, in this order
1. `frontend/scope.md`, all of it.
2. `frontend/docs/api/api-digest.md`. Use `frontend/docs/api/healthaccess-api.json` for full examples.
3. `frontend/progress.md` (decisions D1–D24).
4. `frontend/docs/01_Online_FastAPI_UI_and_Database_Plan.md`: product, security and honesty rules only. Its endpoints are superseded.
5. `frontend/docs/HealthAccess_Interactive_Prototype.html`: UI states and wording.
6. Arc skills via `mcp__arc__get_skill`: `SKILL`, `components`, `composition`, `accessibility`, `checklist`.

Then reply with a 10-line plan for M0 and start. Do not wait for approval to start M0.

## 2. M0: Foundation (you, sequentially)
Do scope §10 "M0" yourself. These files are shared by every lane, so they must exist before anyone forks:
- dependencies (§2) and test runners (§8) with scripts `test`, `test:unit`, `test:e2e`, `test:live`;
- Arc init, foundation and `src/styles/arc-theme.css` (§6);
- BFF: `src/app/api/auth/*`, `src/app/api/v1/[...path]/route.ts`, `src/proxy.ts`, cookie and CSRF rules, and removal of the old rewrite (§3.1);
- `src/api/client.ts`, `errors.ts`, `keys.ts`, and **all** `schemas/*` covering every endpoint in the snapshot;
- `src/api/mocks/` with fixtures and handlers generated from the snapshot's example bodies;
- `(app)` layout with providers, the app shell (§7.2 without data cards) and auth screens (§7.1);
- tests:
  - schemas accept every snapshot example;
  - error mapper;
  - single-flight refresh (5 parallel 401s → 1 refresh);
  - CSRF rejection;
  - `next` redirect validation;
  - an e2e login/logout journey (mocked);
- a live check (`test:live`): login, refresh, `/me`, logout with the demo account.

**Gate "review step 0":** stop. Report using §6 below and wait for the reviewer's reply.

## 3. M1: Parallel lanes (sub-agents)
After the reviewer approves step 0, launch **all six lanes at once**, in a single message with six sub-agent calls. Give each its own git worktree (use the Agent tool's `isolation: "worktree"`, or `git worktree add ../ha-lane-<x> -b lane/<x>`).

| Lane | Scope sections | Owns (may create and edit) |
|---|---|---|
| A Record | §7.3, §7.4 | `src/features/record/`, `src/app/(app)/app/{profile,record,emergency-summary}/`, `src/api/hooks/record.ts`, `src/api/mocks/handlers/record.ts`, `tests/**/record*` |
| B Sharing | §7.5, §7.9 | `src/features/{sharing,practitioner}/`, `src/app/(app)/app/{access,access-log}/`, `src/app/(app)/{lookup,practitioner}/`, `src/api/hooks/{sharing,practitioner}.ts`, matching mocks and tests |
| C Care | §7.8 | `src/features/care/`, `src/app/(public)/{find-care,facilities}/`, `src/api/hooks/directory.ts`, matching mocks and tests |
| D AI | §7.6, §7.7 | `src/features/{assistant,medications}/`, `src/app/(app)/app/{assistant,medications}/`, `src/api/hooks/{symptom,medications}.ts`, matching mocks and tests |
| E Channels | §7.10 | `src/features/channels/`, `src/app/(app)/app/channels/`, `src/api/hooks/channels.ts`, matching mocks and tests |
| F Landing copy | §7.11 | `src/features/landing/content.ts` only |

### Brief template for each sub-agent
Fill in the brackets and keep the rest word for word. Sub-agents only know what you put in the brief.

```
You are Lane [X] ([name]) of the HealthAccess dashboard build. Work only in this worktree: [path], branch lane/[x].

Goal: implement frontend/scope.md sections [§…] completely, including every state in scope §4 and the tests in scope §8 for these screens.

Read first: frontend/scope.md (§1–§6, §8, §9 and your sections), frontend/docs/api/api-digest.md entries for [endpoint list], frontend/node_modules/next/dist/docs for any Next API you touch, and Arc docs via mcp__arc__get_component for every component you use.

You own: [owned paths]. You may read anything. You must NOT edit: src/api/{client,errors,keys}.ts, src/api/schemas/*, any layout, src/proxy.ts, src/styles/*, package.json, or another lane's paths. If you need a change there, describe it in your final report under "Requests for lead" and work around it locally without editing those files.

Rules: Arc rules (scope §6), security checklist (scope §9), no live AI calls, no new dependencies, no console logging, codes never in URLs, storage or the query cache, small commits (no AI attribution).

Done means: npm run typecheck, lint and test pass in your worktree; component tests cover loading, success, empty, validation, denied, retry (and conflict where relevant); your e2e journey from scope §8 passes (mocked); the Arc checklist skill sweep is clean for your screens.

Final report (max 40 lines): files added, tests added with pass counts, screenshots taken at 390 and 1440 (paths), Arc components used, deviations from scope with reasons, Requests for lead, open questions.
```

### While lanes run
Do not edit lane-owned paths. Prepare M2: e2e harness pages, overview cards (§7.2) backed by the hooks the lanes will expose, and the Lighthouse script.

### Merging
Merge lanes **one at a time** into the feature branch: F, C, A, B, E, D. After each merge, run `typecheck`, `lint`, `test` and `test:e2e`. Resolve conflicts yourself. Apply lane "Requests for lead" in shared files, with tests. If a lane failed its done-criteria, send it back with specific feedback rather than fixing it silently.

**Gate "review step 1":** stop after all lanes are merged and green. Report using §6.

## 4. M2: Integration (you, plus up to 2 sub-agents)
- Overview cards (§7.2) and the full e2e suite (§8, six journeys).
- `@axe-core/playwright` at 390, 768, 1024 and 1440 px: zero serious or critical issues.
- Lighthouse mobile on `/app` and `/find-care`.
- Security sweep (§9) with evidence.

You may run two sub-agents in parallel: one for the a11y and responsive sweep, one for the security sweep. **Both report only; you apply fixes.**

**Gate "review step 2":** stop and report.

## 5. When the reviewer replies
- "approved": continue to the next step.
- A list of findings: fix each one, add a test where it is a behaviour bug, log it in `progress.md` → Review log, and report again for the same step.

## 6. Gate report format (paste into chat)
```
Step N report
Status: ready for review | blocked
Branch / commits: <branch>, <first>..<last>
Checks: typecheck ✓/✗ · lint ✓/✗ · build ✓/✗ · unit N/N · component N/N · e2e N/N · live smoke ✓/✗/skipped
Screens done: <route list>  ·  States verified: <yes/no per screen>
Security evidence: cookies/storage screenshots <paths>; grep output for localStorage|sessionStorage|console\. ; codes-in-cache test ✓
Screenshots: <paths at 390/768/1024/1440>
Deviations from scope: <item → reason>
Backend questions (B#): <new or updated>
Next: <what step N+1 will do>
```
