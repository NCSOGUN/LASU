# HealthAccess frontend progress

## Status summary
Phase 2 (landing page): research is done. Waiting for approval of the palette and headline before building.

## Completed
- **Phase 0:** audit approved (2026-11-17). All five defaults accepted (see Decisions).
- **Phase 1:**
  - Next.js 16.4 (App Router, Cache Components) with TypeScript strict, Tailwind 4, ESLint 9, GSAP 3.15 and `@gsap/react`.
  - `/api/v1/*` proxied to FastAPI (`HEALTHACCESS_API_ORIGIN`).
  - Security headers on every route (`Referrer-Policy: no-referrer`, nosniff, no framing, Permissions-Policy).
  - `Cache-Control: no-store` on `/app`, `/practitioner`, `/lookup`, `/admin` and `/assistant`.
  - Reference docs moved to `docs/`. Third-party screenshots are gitignored.

## In progress
- **Phase 2:** landing page. `landing-references.md` is written; palette and headlines are proposed.

## Next
- After the palette and headline are approved: build the landing sections in the order given in `landing-references.md` (how-it-works comes before the body map).
- Run typecheck, lint and build. Take screenshots at 360, 768, 1280 and 1920 px.

## Blocked/Decisions
| # | Decision | Source |
|---|---|---|
| D1 | Landing page at `/`, assistant at `/assistant` | Q1, approved |
| D2 | Use the DB's 8 field keys and types (arrays for allergies, medications and conditions), not the prototype's 6 strings | Q2, approved |
| D3 | Landing Channels section shows a scripted SMS/USSD simulation (fictional, labelled). No interactive simulator in the app | Q3, approved |
| D4 | No analytics in Release 1. If added later: page paths only, never `/app`, `/practitioner` or `/lookup` | Q4, approved |
| D5 | English only. Strings kept in one place for later translation | Q5, approved |
| D6 | No Three.js. Hero art is layered SVG with GSAP: lighter, and works without WebGL | Phase 1 stack |
| D7 | Practitioner access moves out of `/lookup` into `/practitioner/lookup` | Audit |
| D8 | Backend points to confirm. Mock defaults: CSRF uses a double-submit cookie plus an `X-CSRF-Token` header; step-up auth is a 403 with `REAUTH_REQUIRED`; practitioner accounts are seeded | Audit gap |
| D9 | Cache Components keeps hidden routes' state (`<Activity>`). Screens that show codes must clear them on hide or unmount | Next 16 docs |

**Open items:**
- **[SOURCE NEEDED]:** no statistics are available yet. The landing page uses qualitative copy only.
- `directory.web_leads` (unverified web-search facilities) exists in the DB and the Node service but not in Plan 1. If the API ever returns them, they need an "unverified" label.

## Review log
_(empty)_
