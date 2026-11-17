# HealthAccess frontend progress

## Status summary
Phase 2 (landing page) is done: dark v2, Murmur-style hero.
Phase 3 is written: `scope.md` and `docs/BUILDER_PROMPT.md`, based on the live API snapshot in `docs/api/`.
Next: the builder model runs M0. The reviewer (this session) checks each gate.

## Completed
- **Phase 0:** audit approved. Defaults D1–D5 accepted.
- **Phase 1:**
  - Next.js 16.4 (App Router, Cache Components), TypeScript strict, Tailwind 4.
  - `/api/v1` proxied to FastAPI.
  - Security headers, plus `no-store` on sensitive routes.
- **Phase 2 v1:** light layered-SVG landing page (commit `76739ea`). Kept in history and replaced by v2.
- **Phase 2 v2:** dark landing page.
  - **Hero:** blur-in headline and a CSS phone cycling the three journeys, with counter, pause and reduced-motion support.
  - **Feature grid** (bento): the directory card has a canvas wireframe globe.
  - **How it works:** a pinned phone follows the scroll steps.
  - **Channels carousel:** scroll-snap; the voice card is marked "later".
  - **Trust section:** glossy SVG objects, plus a Release 1 scope strip.
  - **Final CTA and footer.**
  - **Preloader:** kept and recoloured.
  - **Verified:**
    - No horizontal overflow at 360, 768, 1280 or 1920 px.
    - Reduced motion: no preloader, all content visible.
    - Without JavaScript: content visible.
    - Keyboard: tab order follows the page (skip link, nav links, then the carousel controls).
    - Headings: in order, h1 → h2 → h3.

- **Phase 3:**
  - `docs/api/healthaccess-api.json` and `docs/api/api-digest.md`: snapshot of the live API docs, 48 endpoints, generated 2026-11-17T18:00Z.
  - `scope.md`: the full build guide.
  - `docs/BUILDER_PROMPT.md`: orchestration prompt for the builder model (M0 lead, six parallel sub-agent lanes, M2 integration, gates).

## In progress
- None. Waiting for the builder model to start M0.

## Next
- Builder: M0 Foundation, then "review step 0" (scope §10).
- Backend team: answer B1–B6 (scope §1).

## Blocked/Decisions
| # | Decision | Source |
|---|---|---|
| D1 | Landing page at `/`, assistant at `/assistant` | Q1 |
| D2 | DB's 8 field keys and types | Q2 |
| D3 | Channels shown as fictional simulations; no interactive simulator | Q3 |
| D4 | No analytics in Release 1 | Q4 |
| D5 | English only; landing strings in `src/features/landing/content.ts` | Q5 |
| D6 | No Three.js. The globe is about 100 lines of canvas 2D | Stack |
| D7 | Practitioner access lives at `/practitioner/lookup`, not `/lookup` | Audit |
| D8 | Backend points to confirm. Mock defaults: CSRF uses a double-submit cookie plus `X-CSRF-Token`; step-up auth is a 403 with `REAUTH_REQUIRED`; practitioner accounts are seeded | Audit |
| D9 | Next 16 keeps hidden routes' state alive. Screens that show codes must clear them on hide | Next 16 docs |
| D10 | **v2 redesign** follows the 21st.dev "Murmur" template's layout and motion only. No template assets are copied: the hand photo becomes a CSS phone, and the glossy images are original SVGs in `public/landing/objects/` | User request |
| D11 | **GSAP removed.** v2 motion is reveal-on-enter, done with CSS and one IntersectionObserver. This supersedes the original stack note | v2 |
| D12 | The template's email form is replaced by links. There is no newsletter backend, and collecting emails needs a consent and storage decision | v2 |
| D13 | Template sections not carried over: problem block, body-silhouette map, team. The v1 versions are in commit `76739ea` if wanted back | v2 |
| D14 | Fonts: Inter (body) plus Manrope (headings) to match the template's display face | v2 |
| D15 | **Hero hand photo:** generated with Higgsfield (`gpt_image_2_6`, job `8c2517f4…`, variant 3 of 4, about 1 credit). Higgsfield's background remover kept only the phone, so the cut-out was done locally by keying the black background (scratchpad script). Stored as `public/landing/hero/hand-phone.webp` (688×1024, 65 KB). The screen rectangle is measured in `HeroPhone.tsx`; re-measure if the image changes | User request |
| D17 | **The live API supersedes Plan 1's endpoint tables.** Base `https://healthaccess.billzpay.com.ng/v1`; snapshot in `docs/api/`. Plan 1 still governs product, security and honesty rules | API docs, 2026-11-17 |
| D18 | Auth via a Next BFF: route handlers keep access and refresh tokens in HttpOnly cookies. The generic `/api/v1/[...path]` proxy replaces the `next.config` rewrite (which also used the wrong base path) | User choice |
| D19 | Dashboard theme is dark, matching the landing page. Arc `data-theme="dark" data-accent="green"` plus `src/styles/arc-theme.css` overrides | User choice |
| D20 | Data layer: axios with a single-flight refresh, TanStack Query, Zod parsing at the boundary. `retry: false` for mutations, because the API has no idempotency keys | User choice + API |
| D21 | Dashboard UI uses Arc components via the arc MCP. The landing page stays Tailwind | User choice |
| D22 | First build includes the AI symptom assistant, medication schedules, the practitioner portal, and phone/SMS/USSD consent | User choice |
| D23 | **A separate builder model implements; this session reviews.** The builder runs parallel sub-agent lanes and must write tests. The user's note overrides their "you build it" option | User note |
| D24 | Not built: generative-UI renderer, admin, FCM/service worker, password reset, map/geolocation. The landing copy needs fixes because AI and lookup now require sign-in (scope §7.11) | API gaps |
| D16 | Hero headline changed by the user to "Care Within Reach, / Wherever You Are": two equal lines, as in the reference template. This replaces approved option 1 | User request |

**Open items:**
- **[SOURCE NEEDED]:** none outstanding. v2 contains no statistics.
- `directory.web_leads` exists in the DB but not in Plan 1. If shown, label it "unverified".
- Links to `/assistant`, `/lookup`, `/register`, `/find-care` and `/login` return 404 until the builder ships those routes. The landing "Open the assistant" moves to `/app/assistant` (Lane F).
- Backend questions B1–B6 are in scope §1: allergy field vs records, duplicate condition/medication fields, `includeRecords` and the AI provider, HTTPS-only, a practitioner test account, no `GET /me/consents`.

## Review log
- **2026-11-17, v1 self-review:**
  - Nav contrast over dark sections fixed.
  - Body-map list order fixed on mobile.
  - Preloader skip button no longer focusable after the curtain lifts.
- **2026-11-17, v2 self-review:**
  - The hero carousel label wrapped on mobile; the controls were moved out of the phone's width.
  - Step text was dimmed on mobile, where every step shows its own screen; dimming now applies only at `lg`.
  - A light strip showed below the footer; fixed with `body:has(.landing)`.
  - Phone text inherited `text-center` from the hero; fixed.
- **2026-11-17, hero rework (user feedback):** rebuilt to match Murmur.
  - Bold two-line headline behind a hand-held phone that is about 383 px wide on desktop.
  - Green glow behind the phone removed.
  - Black fade over the wrist.
  - The live UI is scaled into the photo's screen rectangle.
  - Subline is one line from 768 px up and wraps on phones.
  - No horizontal overflow at 360, 768, 1280 or 1440 px.
