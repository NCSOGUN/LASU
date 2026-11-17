# HealthAccess frontend: build scope

This is the build guide for the signed-in application and the public care pages. The landing page (`/`) already exists and is out of scope, except for the copy fixes in Lane F.

**How to use this file**
- **Builder model:** follow it exactly. The kick-off brief is in `docs/BUILDER_PROMPT.md`.
- **Reviewer (lead):** reviews each gate ("review step N") against §12.
- **Changes:** if this file and the live API disagree, stop and report. Do not guess.

---

## 1. Sources of truth

| Priority | Source | Governs |
|---|---|---|
| 1 | `docs/api/healthaccess-api.json` and `docs/api/api-digest.md` (snapshot of http://healthaccess.billzpay.com.ng/docs, 48 endpoints) | Every endpoint, field, status code and error code |
| 2 | `docs/01_Online_FastAPI_UI_and_Database_Plan.md` | Product rules, security rules, honesty rules. Its endpoint tables are **superseded** by row 1 |
| 3 | `docs/HealthAccess_Interactive_Prototype.html` | UI states and wording for the core journeys |
| 4 | `progress.md` | Decisions D1–D24 and the review log |
| 5 | `AGENTS.md` + `node_modules/next/dist/docs/` | Next.js 16 APIs. Read the relevant page before using any Next API |

### Where the live API differs from Plan 1 (resolved)
| Topic | Live API | Frontend resolution |
|---|---|---|
| Auth | Bearer access JWT (900 s) + single-use refresh token (30 d) | BFF keeps both in HttpOnly cookies (§3). The browser never sees a token |
| Response shape | Raw JSON. Errors are `{error, message, request_id, issues?}` | One Zod-parsed client and one error mapper (§4) |
| CORS | Only `https://healthaccess.vercel.app` | All browser calls go same-origin to the BFF |
| Chat / generative UI | **None** | No generative-UI renderer. The assistant is the symptom-analysis API (§7.6) |
| Emergency lookup | `POST /records/emergency` requires a signed-in account | `/lookup` is behind sign-in. Landing CTA copy is updated (Lane F) |
| Stale edit | `409 version_conflict` (not 412) | Keep the draft, refetch, show both values (§4) |
| Grant duration | `expires_in_minutes` 1–1440, default 30 | Offer 15 min, 30 min (default), 1 h, 4 h, 24 h |
| Channels | `WEB_PRACTITIONER`, `USSD` (grants); `SMS`, `USSD` (consents) | Use these exact uppercase enums |
| Practitioner role | No endpoint creates or approves practitioners | Test with a seeded practitioner. Show the 403 state otherwise |
| Admin | No endpoints | Not built |
| Idempotency | No `Idempotency-Key` support | `retry: false` on all mutations. Disable submit while pending |
| Avatar upload | Returns `503 storage_unavailable` in this environment | Build the error state. The success path is behind `NEXT_PUBLIC_AVATAR_UPLOAD=1` |
| Push (FCM) | `POST /devices` exists, FCM disabled server-side | Not built (no service worker, Plan 1 rule) |

### Open questions for the backend team (build with the default; do not block)
| # | Question | Default until answered |
|---|---|---|
| B1 | `PUT /me/medical` allergy **records** (with severity) do not update the shareable `allergies` **field**. Which is canonical for sharing? | The `allergies` field (edited on `/app/record`) is what gets shared. The profile's allergy records are labelled "Allergy history (private)" with a link to the record page to share |
| B2 | `conditions` vs `existing_conditions`, and `current_medications` vs `existing_medications`: which are canonical? | Share and edit `conditions` / `current_medications` (emergency-eligible). Show `existing_*` read-only if non-empty |
| B3 | With `includeRecords=true`, does `/symptom` send stored record fields or codes to the AI provider? | Default the "Use my health record" toggle to **off** in the UI and explain what it does. Landing claim rewritten (Lane F) |
| B4 | The API's public docs URL is plain HTTP. Production must be HTTPS-only | Always use `https://healthaccess.billzpay.com.ng/v1` |
| B5 | How do we get a test practitioner account? | Ask the lead. Until then the practitioner lane runs on MSW mocks only |
| B6 | There is no `GET /me/consents`, so the UI cannot show existing SMS/USSD consents after a reload | Show the consent returned by `PUT`, and explain that re-saving replaces it |

---

## 2. Stack and dependencies
Existing: Next.js 16.4 (App Router, Cache Components), React 19, TypeScript strict, Tailwind 4 (landing only), ESLint 9.

Add these, and only these, without asking. Each needs a one-line justification in its commit.

| Package | Why |
|---|---|
| `axios` | Required by the user. Interceptors for single-flight refresh, per-request timeouts, upload progress |
| `@tanstack/react-query` (+ `@tanstack/react-query-devtools` as a dev dependency) | Required by the user. Server-state cache, mutations, AI long-running calls |
| `zod` | Response and form validation at the trust boundary |
| `react-markdown` | AI replies are Markdown. Raw HTML stays off (no `rehype-raw`) |
| Arc items via `npx shadcn@latest add …` (brings `motion`, `lucide-react`) | Required by the user for dashboard UI |
| `msw` (dev) | One mock layer shared by unit, component and e2e tests |
| `vitest`, `@vitest/coverage-v8`, `jsdom`, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom` (dev) | Unit and component tests |
| `@playwright/test` (dev) | End-to-end journeys |
| `@axe-core/playwright` (dev) | Automated accessibility checks in e2e |

Not allowed: other UI kits, state libraries, date libraries (use `Intl`), form libraries (use Arc inputs + Zod), analytics SDKs.

---

## 3. Architecture

### 3.1 Backend-for-frontend (BFF)
```
Browser ──axios──▶ /api/auth/*  (Next route handlers) ──▶ https://healthaccess.billzpay.com.ng/v1/auth/*
        ──axios──▶ /api/v1/*    (Next route handler)  ──▶ https://healthaccess.billzpay.com.ng/v1/*   (+ Authorization: Bearer <ha_at>)
```
- **Env** (server-only, add to `.env.example`): `HEALTHACCESS_API_ORIGIN=https://healthaccess.billzpay.com.ng`.
- **Rewrite:** remove the `/api/v1` rewrite in `next.config.ts`. The proxy route below replaces it. The old rewrite also pointed at the wrong base path.
- **Cookies** (set only by route handlers):

  | Name | Content | Flags |
  |---|---|---|
  | `ha_at` | access JWT | `HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=900` |
  | `ha_rt` | refresh token | `HttpOnly; Secure; SameSite=Lax; Path=/api/auth; Max-Age=2592000` |

  In development on `http://localhost`, `Secure` is dropped only when `NODE_ENV !== 'production'`.
- **Auth route handlers** (`src/app/api/auth/*/route.ts`):
  - `POST login` and `POST register`: call the upstream API, set both cookies, return `{account, roles}`.
  - `POST refresh`: read `ha_rt`, call `/auth/refresh`, set both cookies. On failure, clear both and return 401.
  - `POST logout`: call `/auth/logout` with `ha_rt` and clear both cookies (204 even if upstream fails).
  - `GET session`: if `ha_at` exists, call `GET /me` and return `{account, roles}`. Otherwise return 401.
  - Never return tokens in a body.
- **Generic proxy** (`src/app/api/v1/[...path]/route.ts`, all methods):
  - Forward the path, query and body. Pass multipart through as a stream: don't parse it, keep the `content-type` boundary.
  - Attach `Authorization` from `ha_at`.
  - Copy the upstream status and JSON. Add `Cache-Control: no-store` and the upstream `x-request-id`.
  - Upstream 401: return `401 {error:"token_expired"}` so the client refreshes.
  - Block `/auth/*` through this proxy (404). Auth only goes through the handlers above.
  - Upstream timeout: 190 s for `POST /symptom`, `POST /symptom/*/follow-up` and `POST|PATCH /medications*`; 20 s otherwise. Map timeouts to `504 {error:"upstream_timeout"}`.
- **CSRF:** every non-GET request to `/api/*` must carry the header `X-HA-Client: web` and have an `Origin` matching the app origin. Otherwise return 403. SameSite=Lax cookies plus this check are enough.
- **Route guards** (`src/proxy.ts`, Next 16's renamed middleware; read `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`):
  - Match `/app/:path*`, `/practitioner/:path*` and `/lookup`.
  - No `ha_at` and no `ha_rt` cookie: redirect to `/login?next=<pathname>`. The pathname never contains codes or data.
  - Role checks happen in the page via the session query (the proxy must not decode JWTs).
- **Headers:** keep the existing security headers in `next.config.ts`. Add `/api/:path*` to the `no-store` list.

### 3.2 Client data layer (`src/api/`)
```
src/api/
  client.ts        axios instance + interceptors
  errors.ts        ApiError type + toApiError(e) + userMessage(err)
  keys.ts          query-key factory
  schemas/         one file per API group: auth, me, fields, sharing, records, directory, symptom, medications, channels
  hooks/           one file per feature: useSession, useFields, useGrants, …  (query + mutation hooks only)
  mocks/           MSW handlers + fixtures generated from docs/api/healthaccess-api.json examples
```
- **axios instance:**
  - `baseURL: '/api/v1'`, `timeout: 20_000`, default header `X-HA-Client: web`, `withCredentials: true`.
  - Export `aiTimeout = 190_000` for AI calls.
- **Refresh interceptor** (single-flight; refresh tokens are single-use):
  1. A response comes back 401 with `token_expired`, and the request hasn't been retried yet.
  2. `await (refreshPromise ??= axios.post('/api/auth/refresh').finally(() => refreshPromise = null))`.
  3. Retry the original request once.
  4. If refresh fails: `queryClient.clear()` and redirect to `/login?next=<current pathname>`.
  5. A unit test must show that 5 parallel 401s cause exactly one refresh call.
- **Every hook parses responses with its Zod schema.** A parse failure becomes `ApiError{code:'invalid_response'}` and renders the retry state. Never render unparsed data.
- **TanStack Query defaults:**
  - Queries: `staleTime 30s`, `retry: (n, e) => n < 2 && e.status >= 500 && e.status !== 503`, `refetchOnWindowFocus: true`.
  - Mutations: `retry: false`.
- **Provider placement:** `src/app/(app)/providers.tsx`, a client component mounted only in authenticated and app layouts. The landing page must not load React Query.
- **Query keys:**
  ```ts
  qk.session; qk.me; qk.fields; qk.emergency; qk.patientCode; qk.grants; qk.accessEvents
  qk.services; qk.areas(q); qk.facilities({service, areaId, radius}); qk.facility(id)
  qk.symptoms(page); qk.symptom(id); qk.medications(page); qk.medication(id)
  ```
  Mutations invalidate the narrowest keys, for example grant create → `qk.grants`, `qk.accessEvents`.
- **Patient code (`qk.patientCode`):** `gcTime: 0` and `staleTime: 0`, removed from the cache on unmount (D9). Grant codes from `POST /me/grants` live only in the mutation result and component state, never in the query cache.

### 3.3 Folder structure
```
src/
  app/
    (marketing)/page.tsx            existing landing (move only if needed, keep URL "/")
    (auth)/login, (auth)/register   public auth pages
    (app)/layout.tsx                providers, app shell (sidebar + topbar), session gate
    (app)/app/...                   patient routes (§5)
    (app)/lookup, (app)/practitioner/...
    (public)/find-care, (public)/facilities/[id]
    api/auth/*, api/v1/[...path]    BFF
  api/                              §3.2
  features/<feature>/               screens' building blocks: auth, shell, dashboard, record, sharing, care, assistant, medications, channels, practitioner
  components/arc/                   installed by shadcn CLI. Never edit
  components/                       thin wrappers only (e.g. FormField, ConfirmDialog, CodeDisplay)
  lib/                              format (dates, km, codes), usePrefersReducedMotion (exists)
  styles/arc-theme.css              Arc token overrides (§6)
  proxy.ts                          route guards
tests/
  unit/  component/  e2e/
```

---

## 4. Error and state contract (every screen)

| Upstream | `error` code(s) | UI behaviour |
|---|---|---|
| 400 | `validation_error` + `issues[]` | Map `issues[].path` to the field. Focus the first invalid field. Keep all input |
| 400 | `invalid_field`, `invalid_value`, `invalid_fields`, `invalid_schedule`, `invalid_code`, `no_changes`, `invalid_update`, `invalid_channel`, `channel_link_required`, `image_required`, `invalid_upload` | Inline `alert` with a human message (map table in `errors.ts`). Keep the draft |
| 401 | `invalid_credentials` | Login form error "Email or password is incorrect" |
| 401 | `token_expired` / `unauthorized` | Interceptor refresh (§3.2) |
| 403 | `forbidden`, `patient_profile_required`, `account_inactive` | Denied state: what is needed and who to contact. No retry button |
| 404 | `not_found` | Generic "This item is not available". Never reveal ownership |
| 409 | `email_taken` | Field error on email |
| 409 | `version_conflict` | Keep the draft, refetch, show "This record changed since you opened it" with the new values and two buttons: "Use my changes" (re-submit with new version) and "Discard my changes" |
| 200 | `{available:false}` | "No shared information is available for these codes." Same message for every cause |
| 502 | `ai_invalid_response` | "The assistant could not produce a valid answer. Try again." |
| 503 | `ai_unavailable`, `storage_unavailable`, `sms_unavailable` | Retry state naming the unavailable part. Other features keep working |
| 504 | `upstream_timeout` | "This took too long." The outcome may be unknown for mutations: refetch the list before allowing a retry |
| network | — | Offline banner. Keep drafts |

States required on every data region:
- **loading:** Arc `skeleton` matching the layout;
- **empty:** Arc `empty-state` with one next action;
- **error:** inline Arc `alert` with retry, plus `request_id` shown small for support;
- **denied:** as above;
- **in-place success:** the changed element updates and a status line is announced with `role="status"`.

A toast is never the only confirmation.

---

## 5. Route map and access

| Route | Access | Purpose | Endpoints |
|---|---|---|---|
| `/login` | public | Sign in | BFF `POST /api/auth/login` |
| `/register` | public | Create patient account | BFF `POST /api/auth/register` |
| `/find-care` | public | Service + area search and results (client state, no query string) | `GET /directory/services`, `/directory/areas`, `/directory/facilities` |
| `/facilities/[id]` | public | Facility detail | `GET /directory/facilities/{id}` |
| `/app` | patient | Overview: completeness, emergency status, active grants, recent symptoms, today's doses | `GET /me`, `/me/emergency-summary`, `/me/grants`, `/symptom?limit=3`, `/medications?limit=3` |
| `/app/profile` | patient | Account + medical details, allergy history, medical events, avatar | `GET/PATCH /me`, `PUT /me/medical` (allergies/medicalEvents only), `DELETE /me/allergies/{id}`, `PATCH/DELETE /me/medical-events/{id}`, `POST /me/avatar` |
| `/app/record` | patient | Edit shareable fields with optimistic concurrency | `GET/PUT /me/fields` |
| `/app/emergency-summary` | patient | Choose and order emergency fields, preview | `GET /me/fields`, `PUT /me/emergency-fields`, `GET /me/emergency-summary` |
| `/app/access` | patient | Patient code (reveal/copy/rotate) + grants (create/list/revoke) | `GET /me/patient-code`, `POST /me/patient-code/rotate`, `GET/POST /me/grants`, `DELETE /me/grants/{id}` |
| `/app/access-log` | patient | Audit trail | `GET /me/access-events` |
| `/app/channels` | patient | Verify phone, SMS/USSD consent | `POST /auth/phone/begin`, `/auth/phone/confirm`, `PUT/DELETE /me/consents/{channel}` |
| `/app/assistant` | patient | Symptom history + new conversation | `GET /symptom`, `POST /symptom` |
| `/app/assistant/[id]` | owner | Conversation + follow-ups, rename/severity, delete | `GET /symptom/{id}`, `POST /symptom/{id}/follow-up`, `PATCH/DELETE /symptom/{id}` |
| `/app/medications` | patient | Schedules list + create (manual or AI) | `GET /medications`, `POST /medications` |
| `/app/medications/[id]` | owner | Dose timeline, mark taken/missed, add/remove drug, delete | `GET /medications/{id}`, `PATCH /medications/moments/{id}`, `PATCH /medications/{id}/add`, `PATCH /medications/{id}/remove`, `DELETE /medications/{id}` |
| `/lookup` | any signed-in account | Emergency lookup by patient code | `POST /records/emergency` |
| `/practitioner/lookup` | PRACTITIONER | Patient code + grant code | `POST /records/grant/open` |
| `/practitioner/records/[readSessionId]` | bound PRACTITIONER | Read-only fields, countdown to expiry, close | `GET /records/grant/{id}`, `POST /records/grant/{id}/close` |

Rules:
- IDs in paths are resource UUIDs only, never codes.
- Codes are submitted only in POST bodies.
- The landing CTA "Open the assistant" goes to `/app/assistant`; the guard sends guests to login.
- `/find-care` stays public and is linked from the landing page as the no-account path.

---

## 6. Design system (dashboard)

- **Arc setup:**
  1. `npx shadcn@latest init`, or hand-write `components.json` with `"registries": {"@uiarc": "https://uiarc.dev/r/{name}.json"}` and aliases into `src/components`.
  2. `npx shadcn@latest add https://uiarc.dev/r/arc-foundation.json`.
  3. Import `@/components/arc/foundation.css`, then `@/styles/arc-theme.css`, in the **(app)/(auth)/(public) layouts**, not the landing page.
- **Theme:** dark (decision D19). Put `data-theme="dark" data-accent="green"` on `<html>`. `src/styles/arc-theme.css` overrides, on `:root[data-theme="dark"][data-accent="green"]`, only:
  ```css
  --background:#070d0e; --surface:#0e1719; --surface-muted:#0b1314; --surface-raised:#152224;
  --border:#1d2c2e; --border-subtle:#162325; --border-strong:#2a3d3f;
  --foreground:#d5dfdb; --text-secondary:#8d9e98; --text-muted:#7d8e88;
  --accent:#7fd1ae; --accent-strong:#a8e4c9; --accent-subtle:rgb(127 209 174 / .14); --accent-foreground:#07211a;
  --control-on:#2bb3a3;
  ```
  Contrast was checked against the landing palette (fog 14.4:1, fog-muted 7:1, text-muted 5.7:1 on night).
- **Fonts:** Arc reads `--font-geist` (display) and `--font-inter` (body). In the root layout, add `variable: '--font-geist'` to the existing Manrope config alongside `--font-manrope`, so Arc headings use the brand display face. Inter already loads.
- **Arc rules for every dashboard screen:**
  - one `h1`;
  - one primary button per surface;
  - weights 400/500;
  - no eyebrows or uppercase;
  - no em dashes;
  - semantic tokens only (no hex, no Tailwind colour classes inside dashboard features);
  - concentric radii;
  - a reduced-motion branch for every animation.

  Before finishing any screen, run the Arc skills `checklist` and `accessibility` (`mcp__arc__get_skill`).
- **Process:** `mcp__arc__search_components` then `mcp__arc__get_component` (read "When not to use" and the props) **before** using any item. Use only documented props. Never edit `src/components/arc/*`.

### Component inventory (verify each with `get_component` first)
| Job | Arc id |
|---|---|
| Auth pages | `login-centered`, `signup-form`, `password-field`, `password-strength` |
| Shell | `page-header`, `user-menu`, `drawer` (mobile nav), `breadcrumb`, `tabs` |
| Surfaces / data | `card`, `metric-card`, `badge`, `sortable-data-table`, `timeline` (access log), `pagination`, `reorderable-list` (emergency field order) |
| States | `skeleton`, `empty-state`, `alert`, `toast` (secondary only), `progress` |
| Inputs | `input`, `textarea`, `select`, `combobox` (area search), `multi-select`, `checkbox`, `switch`, `segmented-control` (grant duration), `tag-input` (string arrays), `date-picker`, `date-range-picker` (schedule window), `time-picker` (dose times), `number-field` (height/weight), `phone-input`, `otp-input` (SMS code), `file-dropzone` (symptom attachments, medication document) |
| Confirmation | `dialog` (revoke, delete), `hold-to-confirm` (rotate patient code) |
| Codes | `copy-button`. Code display is a small wrapper `CodeDisplay` (monospace, grouped 4-4-4, masked by default with "Reveal" toggle) |
| Assistant | `chat-thread` → **`ChatComposer` only** (AI replies are Markdown, rendered by our `AssistantMessage` with `react-markdown`, no raw HTML, links get `rel="noopener noreferrer" target="_blank"` and only `https:` URLs) |
| Medications | `gauge` or `progress` (adherence), `calendar` (dose days), `stepper` (AI create flow) |

---

## 7. Screen specs

Format: **data**, **UI**, **states**, **acceptance**. All screens also follow §4.

### 7.1 Auth: `/login`, `/register`, logout
- **Data:** BFF auth handlers. Register fields: firstName, lastName, email, password, password_confirmation, dob? (ISO date), phone? (E.164).
- **UI:** `login-centered` / `signup-form`. Link between them. After success go to `next` (validated: must start with `/` and not `//`), else `/app`. Logout lives in `user-menu`.
- **States:** pending disables submit. `invalid_credentials` gets a generic message. `email_taken` is a field error. `account_inactive` shows the denied state.
- **Acceptance:**
  - no token appears in JS-readable storage (e2e check: `document.cookie` has no `ha_`, localStorage and sessionStorage are empty of tokens);
  - the open-redirect test passes for `next=//evil.com`.

### 7.2 Shell + `/app` overview
- **UI:** sidebar nav (Overview, Assistant, Medications, My record, Emergency summary, Sharing & access, Access log, Channels, Profile) and a topbar with `user-menu`. Below 768 px the nav moves into a `drawer`. Practitioners also see "Practitioner lookup".
- **Overview cards:**
  - profile completeness (filled `fields` / total active);
  - emergency summary status (`available` + field count + link);
  - active grants count;
  - last 3 symptom records with severity badge;
  - today's doses (from the first active schedule) with quick Taken/Missed.
- **States:** each card loads independently with its own skeleton and error state.
- **Acceptance:** keyboard order follows the visual order; the drawer traps focus and Escape closes it.

### 7.3 Record: `/app/profile`, `/app/record`
- **`/app/record`:**
  - Render `GET /me/fields` dynamically by `value_type`: `STRING` → input, `STRING_ARRAY` → `tag-input`. Show `label`.
  - Save sends only changed keys plus `expected_version`.
  - `409 version_conflict` follows §4.
  - Helper text: "New fields are private until you choose to share them."
- **`/app/profile`:**
  - **Account section:** `PATCH /me` with firstName, lastName, email, phone, dob, and password with confirmation in the UI. Changing email or phone shows a note that verification resets.
  - **Medical section:** `PUT /me/medical` with **only** `allergies` and/or `medicalEvents` arrays (B1). Field-type data is edited on `/app/record` to keep versioning.
  - **Allergy history:** list with severity badge plus delete (`DELETE /me/allergies/{id}`).
  - **Medical events:** list plus inline edit (`PATCH`) and delete.
  - **Avatar:** behind the env flag. Show the 503 state message when unavailable.
- **Acceptance:**
  - a failed save keeps the draft and never shows "saved";
  - the stale-version flow works (MSW test);
  - empty arrays delete rows only after an explicit confirm.

### 7.4 Emergency summary: `/app/emergency-summary`
- **Data:** `GET /me/fields`. Eligible means `emergency_eligible && value != null`. `PUT /me/emergency-fields {field_keys (ordered), expected_version}`. Preview comes from `GET /me/emergency-summary`.
- **UI:**
  - Checklist of eligible fields with a reorder control (Arc `reorderable-list` if `get_component` confirms keyboard support).
  - Ineligible fields are shown disabled with the reason "Add a value first" (link to `/app/record`) or "Not shareable in an emergency".
  - Live "What a code lookup reveals" preview, built from the local selection before saving and confirmed from the server after saving.
  - An empty selection turns sharing off, with a confirm.
- **Acceptance:** the preview shows exactly the selected fields in the selected order. A test covers removing a field.

### 7.5 Sharing: `/app/access`, `/app/access-log`
- **Patient code:**
  - `CodeDisplay`, masked `•••• •••• 1234` by default; Reveal shows it for 30 s then re-masks; copy.
  - Rotate uses `hold-to-confirm` plus a `dialog` explaining that all grants and sessions are revoked. After rotating, invalidate `qk.grants`.
- **Create grant:**
  - Field checkboxes (active fields with values).
  - Channels: "Verified practitioner portal" (`WEB_PRACTITIONER`, default on) and "USSD with both codes" (`USSD`).
  - Duration `segmented-control`.
  - Consent text: "The recipient can read the current values of these fields until the code expires or you revoke it. Revoking cannot undo what they have already seen."
  - An explicit **Create access code** button.
- **Receipt:**
  - The 8-digit code is shown once, grouped 4-4, with copy, the expiry in local time, fields and channels.
  - Text: "This code will not be shown again."
  - It is cleared from state on unmount or route hide.
- **Grant list:**
  - Status badge (active/expired/revoked), field labels, channels, expiry.
  - Revoke via `dialog`, which then updates in place.
  - No codes in the list (the API doesn't return them).
- **Access log (`/app/access-log`):**
  - `timeline` with channel, action (humanised: `grant_create` → "Access code created", etc.), outcome badge, field labels and local time.
  - `limit` 50 with a "Load more" that raises the limit up to 100. The API has no cursor: show "Showing the latest 100 events" at the cap.
- **Acceptance:**
  - the codes never appear in any URL, `console`, or query cache (unit test inspects `queryClient.getQueryCache()` after creating a grant);
  - revoke updates both the list and the log.

### 7.6 Assistant: `/app/assistant`, `/app/assistant/[id]` (AI, long-running)
- **List:**
  - `GET /symptom?page&limit=10` with `pagination`.
  - Each row: name, severity badge (MILD/MODERATE/SEVERE with text, not colour alone), summary, date.
- **New conversation:**
  - `ChatComposer` (message 1–8000 chars) and attachments via `file-dropzone`: up to 5 files, `image/*` or `application/pdf`, 10 MB each, validated client-side.
  - Toggles: "Use my health record for context" (`includeRecords`, **default off**, B3) and "Let the assistant update this record's title and severity" (`modifyHistory`, default on).
  - Submit sends multipart `POST /symptom` with `aiTimeout`.
- **Pending UI:**
  - The user's message appears immediately as "sending" (local only). An assistant placeholder reads "Thinking. This can take up to 3 minutes."
  - A Cancel button aborts the request (AbortController) and explains the record may still be created, then refetches the list.
  - Re-submit is disabled while pending.
- **Thread page:**
  - Render `messages` (`type: Human|AI`). AI content goes through `AssistantMessage` (safe Markdown).
  - Follow-up `POST /symptom/{id}/follow-up` appends the two returned messages to the cached thread (setQueryData), then invalidates.
  - Rename and severity via `PATCH`. Delete via `dialog` then go back to the list.
- **Safety copy** (always visible near the composer):
  - "General information only. Not a diagnosis. In an emergency, seek local emergency care immediately."
  - If `severity === 'SEVERE'`, show an Arc `alert` (warning) with urgent-care guidance above the thread.
- **Acceptance:**
  - XSS strings in AI content render as text, with no raw HTML (unit test);
  - 503 `ai_unavailable` shows the retry state, and the list still loads;
  - cancel works;
  - no double submission.

### 7.7 Medications: `/app/medications`, `/app/medications/[id]`
- **Create**, a `stepper` with two paths:
  - **Manual:** start/end date (`date-range-picker`) and one or more drugs `{drug, dose, frequency, times[{hour, minute}]}` (`time-picker`) → `POST /medications` JSON. Instant.
  - **From text or document (AI):** date range plus free text **or** one document (multipart, 10 MB) → `POST /medications` with `aiTimeout`. Same pending/cancel pattern as §7.6.
  - After an AI create, open the schedule with a banner: "Created by AI from your text. Check every drug, dose and time before relying on it."
- **List:** title or summary, date range, adherence `progress` (Decimal **strings**: parse with `Number()`), `pagination` (limit max 50).
- **Detail:**
  - Moments grouped by local day (convert `time` from UTC with `Intl.DateTimeFormat`, never string-slice).
  - Each moment has a segmented Taken / Missed / Pending control → `PATCH /medications/moments/{id}`, applied optimistically with rollback on error.
  - Update progress and score from the response.
  - Add drug (`/add`, structured), remove drug (`/remove {drug, from?}`) with confirm, delete schedule with confirm.
- **Acceptance:**
  - timezone test: a moment at `2026-11-17T07:00:00.000Z` shows 08:00 in Africa/Lagos;
  - Decimal strings are handled;
  - optimistic rollback is tested.

### 7.8 Find care: `/find-care`, `/facilities/[id]` (public)
- **Form:**
  - Service `select` (`/directory/services`).
  - Area `combobox` with 250 ms debounce (`/directory/areas?q=&limit=10`).
  - Radius select (5/10/25/50 km, default 25).
  - Optional "Use my location" is **not offered**: the API takes `area_id` only, so the area is the only path.
- **Results:**
  - Up to 3 (`limit=3`, a "Show more" raises it to 10).
  - Each card: name, address, `distance_km` labelled "≈ X km from the area centre (straight line)", phone link only if present.
  - Show a "Demo data" badge when `is_demo`.
  - Empty state: "No listed facility offers this service within N km. Try a wider radius or another area."
- **Detail:** address, area, services, phone (`tel:` only if present), `last_verified_at` as "Directory details last verified <date>", `source_trust` badge, and the note "A recommendation does not book a visit or confirm availability."
- **Acceptance:** a closer facility without the service is never shown (it's server-side, but an e2e mock checks the UI doesn't merge lists); the empty and wider-radius flows work.

### 7.9 Lookup and practitioner
- **`/lookup` (signed-in):**
  - Patient code input (numeric, 12 digits, `autocomplete="off"`), then `POST /records/emergency`.
  - Result: a read-only field list. `available:false` gets the generic message.
  - Clear the input and result on unmount.
  - Never put the code in the URL.
- **`/practitioner/lookup`:**
  - The session has `roles` including `PRACTITIONER`, otherwise show the denied state.
  - Two code inputs → `POST /records/grant/open`.
  - On `available:true`, store the projection in the query cache under `qk.readSession(id)` and navigate to `/practitioner/records/[readSessionId]`.
- **`/practitioner/records/[id]`:**
  - `GET /records/grant/{id}`, refetched every 60 s and on focus.
  - Countdown to `expires_at`.
  - On `available:false`: "Access has ended. It may have expired or been revoked."
  - "Close record" → `POST …/close`, then back to lookup.
  - Read-only. No print styles that expose more.
- **Acceptance:** a revoked grant (MSW flips to `available:false`) ends the session view at the next refetch.

### 7.10 Channels: `/app/channels`
- **Phone verification:**
  - `phone-input` (E.164, default +234) → `POST /auth/phone/begin`.
  - Then `otp-input` (6 digits) → `/auth/phone/confirm`.
  - A resend timer of 60 s. `invalid_code` gets an inline error. Five failures means starting again.
- **Consents (SMS, USSD):**
  - For each, a field multi-select, duration (1 day, 7 days, 30 days default) and an explicit **Allow** button → `PUT /me/consents/{channel}`.
  - Show `channel_link_required` as "Verify a phone first".
  - Revoke → `DELETE` with confirm.
- **Note:** the API has no GET for consents, so after saving show the returned consent and keep it in `qk.consents` for the session. Tell the user: "Your SMS and USSD permissions are saved. Re-open this page to change them." (Backend ask B6: add `GET /me/consents`.)
- **Acceptance:** the OTP is never logged; the consent copy explains exactly which fields SMS/USSD can read.

### 7.11 Landing copy fixes (Lane F, `src/features/landing/content.ts` only)
- `finalCta.cardTitle` "No account needed to ask for care." becomes "No account needed to find care." Link it to `/find-care`.
- Hero and nav "Open the assistant" stays, and now requires sign-in. Add a secondary "Find care without an account" link to `/find-care`.
- `hero.secondary` "Look up an emergency summary" stays (`/lookup`, sign-in required).
- `trust.items[3]` "Codes stay out of the AI" changes to "Your record stays out of the AI unless you choose", with body "Codes are never sent to the AI. The assistant only uses your record if you switch it on." This depends on B3; if the backend says otherwise, report back.
- `bento.threads` copy changes from facility chat to symptom assistant ("Describe how you feel. Get general guidance and when to seek care.").
- `steps[0]` mentions the find-care form, not chat-based matching.

---

## 8. Testing (required; a lane is not done without them)
- **Runner config:**
  - Vitest (`jsdom`) with MSW `setupServer`.
  - Playwright against `next build && next start` with MSW **disabled** and API calls intercepted by `page.route('**/api/v1/**')` plus fixtures from `src/api/mocks/fixtures`.
  - Scripts: `test`, `test:unit`, `test:e2e`, `test:live`.
- **Unit:**
  - every Zod schema accepts the snapshot's example bodies;
  - the error mapper (each code);
  - the refresh single-flight;
  - code masking;
  - `next` redirect validation;
  - timezone formatting;
  - Decimal-string parsing;
  - AssistantMessage XSS (`<img src=x onerror=alert(1)>` renders as text).
- **Component (RTL + MSW):** for every screen, loading → success, empty, validation, denied, retry, and conflict (where relevant).
- **E2E (Playwright, mocked):**
  1. register → record fields → emergency selection → preview;
  2. create grant → receipt → revoke → log shows it;
  3. practitioner open → view → revoked → ended;
  4. find care → result → detail;
  5. assistant create → follow-up → cancel path;
  6. medications manual create → mark taken → progress.

  Each runs `@axe-core/playwright` with zero serious/critical violations at 390 and 1440 widths.
- **Live smoke** (`test:live`, opt-in, never in CI by default):
  - login with the public demo account `demo.patient@example.test` / `DemoPass123!` (published in the API docs);
  - `GET /me`, `/me/fields`, `/directory/services`;
  - **no AI endpoints and no writes**.
- **Coverage target:** 80% lines on `src/api/**` and `src/lib/**`.

---

## 9. Security checklist (verify at every gate)
- No `access_token`, `refresh_token`, patient code or grant code in:
  - URL, query string, `localStorage`, `sessionStorage`, IndexedDB or the query cache (grant code);
  - `console.*` (add the ESLint rule `no-console` for `src/**` except `src/lib/log.ts`, which is a no-op in production);
  - error messages;
  - Next server logs (the BFF logs path and status only).
- `Cache-Control: no-store` on `/api/*` and on sensitive pages (already set for pages).
- CSRF header + Origin check on BFF mutations (unit test the route handler).
- `next` redirect allow-list.
- Markdown: no raw HTML, `https:` links only.
- File inputs: type + size checked client-side; the server still validates.
- No service worker, no analytics (D4).

---

## 10. Ordered build steps and lanes

| Step | Owner | Deliverable | Gate acceptance |
|---|---|---|---|
| **M0 Foundation** | Lead | Deps (§2), Arc init + foundation + theme (§6), BFF auth + proxy + guards (§3.1), axios + interceptors + Query provider (§3.2), all Zod schemas + MSW fixtures from the snapshot, test runners, app shell (§7.2 without data cards), login/register/logout (§7.1) | Live login/refresh/logout works with the demo account; single-flight refresh test; no tokens in the browser; typecheck/lint/build/tests green → **review step 0** |
| **M1 Lane A, Record** | Sub-agent | §7.3, §7.4 | Tests §8 for these screens → part of **review step 1** |
| **M1 Lane B, Sharing** | Sub-agent | §7.5, §7.9 | as above |
| **M1 Lane C, Care** | Sub-agent | §7.8 | as above |
| **M1 Lane D, AI** | Sub-agent | §7.6, §7.7 | as above |
| **M1 Lane E, Channels** | Sub-agent | §7.10 | as above |
| **M1 Lane F, Landing copy** | Sub-agent | §7.11 | as above |
| **M2 Integration** | Lead | Merge lanes, overview cards (§7.2), e2e (§8), axe at 390/768/1024/1440, Lighthouse mobile on `/app` and `/find-care` (target LCP < 2.5 s, CLS < 0.1) | **review step 2** |

**Lane ownership** (prevents merge conflicts):
- Each lane owns only `src/features/<its feature>/`, its `src/app/(…)/<routes>/`, its hooks file in `src/api/hooks/`, its tests and its MSW handlers file.
- **Lead-only:** `src/api/client.ts`, `errors.ts`, `keys.ts`, `schemas/*`, layouts, `proxy.ts`, theme, `package.json`. A lane that needs a change there writes a request in its report instead of editing.

---

## 11. Do-not-build list
- Generative-UI renderer, chat-based facility matching (no API).
- Admin facilities and practitioners screens (no API).
- Password reset (no API; Plan 1 rule).
- FCM / `POST /devices`, service worker, offline cache of medical content.
- Map provider, geolocation-based search (the API needs `area_id`).
- Booking, prescribing, EHR, transfer or "send record to hospital" UI.
- Interactive SMS/USSD simulator.
- Analytics or error-reporting SDKs.
- Any copy that implies diagnosis, availability, or verified clinical advice.

---

## 12. Definition of done and review checklist
A step is done when:
- `npm run typecheck`, `lint`, `build`, `test` and `test:e2e` pass;
- every screen in scope has all §4 states;
- the §9 checklist passes with evidence (screenshots of the cookie and storage panes, the grep output for `localStorage|sessionStorage|console\.`);
- the Arc `checklist` skill sweep is clean;
- `progress.md` is updated (Completed, Decisions, Review log);
- commits are small and conventional.

The reviewer checks:
- correctness against §5–§7 and the API snapshot;
- security (§9);
- accessibility (keyboard, focus, labels, `role="status"` announcements, contrast in the dark theme);
- performance (no React Query or Arc on the landing bundle; AI calls never block other UI);
- naming, dead code, missing states;
- tests that actually assert the behaviour.
