# Handoff: HealthAccess frontend (deadline today)

You are taking over as **lead** of the HealthAccess dashboard build. Work in `/home/micheal/Desktop/web-dev/ongoing-projects/healthaccess` on branch **`feat/m0-foundation`**. The Next app is in `frontend/`.

## Read first
1. `frontend/scope.md`: the contract.
2. `frontend/docs/BUILDER_PROMPT.md`: process, lanes, gates.
3. `frontend/progress.md`: decisions and merge log.
4. `frontend/docs/api/api-digest.md`: the live API (base `https://healthaccess.billzpay.com.ng/v1`).
5. `frontend/AGENTS.md`: Next 16 differs from your training. Read `frontend/node_modules/next/dist/docs` before using Next APIs.

## Where things stand
- **Done on `feat/m0-foundation`** (pushed to origin):
  - landing page;
  - M0 foundation: BFF auth with HttpOnly cookies, axios + TanStack Query, Zod schemas, MSW, Arc dark theme, app shell, login/register;
  - M2 prep: overview cards, Lighthouse and security scripts;
  - Lane F (landing copy), merged.
- **Local, NOT committed yet** on `feat/m0-foundation`. Check with `git status`, then commit:
  1. Merge of `origin/main` (backend monorepo, no frontend files). The merge commit `945fb9b` is local and not pushed.
  2. BFF proxy fix: `src/lib/auth-bff.ts` gains `isBlockedPath()`, which allows `auth/phone/begin` and `auth/phone/confirm` through the generic proxy. `src/app/api/v1/[...path]/route.ts` uses it. New test `tests/unit/proxy-path.test.ts` (passes).
  3. `tests/e2e/auth.spec.ts` restored from commit `b4b24df`, because the committed copy was truncated.
  4. Deleted `tests/e2e/support.ts` and `tests/e2e/overview.spec.ts`. They were corrupted (all null bytes). Rewrite the overview e2e journey from scratch during M2.
  - The full typecheck, lint and vitest run was NOT done after these changes. Run it first.
- **Lanes A–E** (worktrees `../ha-lane-a` … `../ha-lane-e`, branches `lane/a` … `lane/e`, pushed):
  - Each has 3–4 commits of a previous agent's half-finished work.
  - A second round of agents was finishing them and was stopped mid-work, so **each worktree may have uncommitted changes**. In each lane: `git status`, commit what is there, then run `npm run typecheck`, `npm run lint` and `npx vitest run`.
  - Lane A was last at "typecheck, lint, full suite, then e2e".
  - Per-lane e2e ports: A 3221, B 3222, C 3223, D 3224, E 3225.
- **Known issues:**
  - Lane B changed the shared `vitest.config.mts`. Review that change before merging.
  - `src/features/landing/HeroPhone.tsx` has an unused `pad` (lint warning).
  - Untracked `frontend/image.png` is a reference screenshot. Do not commit it.

## What to do, in order
1. **Commit and push** the local changes on `feat/m0-foundation`. Run typecheck, lint and vitest, and fix anything that's red.
2. **Finish the lanes in parallel** with sub-agents, one per worktree. Use the brief template in `BUILDER_PROMPT.md` §3; each lane's sections are in scope §7. Each lane must:
   - pass typecheck, lint, vitest and its e2e spec;
   - commit in small chunks;
   - `git push origin lane/<x>`.
3. **Merge lanes one at a time** into `feat/m0-foundation` in the order C, A, B, E, D. Run typecheck, lint, vitest and e2e after each merge, and apply the lanes' "Requests for lead" in shared files.
4. **M2:** overview e2e (rewrite), axe at 390/1440, security sweep (`npm run security`), `npm run build`. Then push and open a PR to `main`.
5. **If time runs short**, prioritise in this order:
   1. a green build with login → dashboard → find care → record/emergency summary → grants;
   2. the assistant and medications;
   3. channels and practitioner.

   Ship working screens over polish, but never break auth or the security rules in scope §9.

## Rules (non-negotiable)
- No tokens or codes in URLs, storage, logs or the query cache.
- Never call the live AI endpoints (`/symptom`, AI `/medications`) in tests.
- Arc components: call `mcp__arc__get_component` before using one, documented props only, never edit `src/components/arc/*`.
- Small conventional commits with **no AI or co-author attribution**. Never commit `.env*` except `.env.example`.
- Update `frontend/progress.md` after each step.
