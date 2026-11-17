# Offline Access Backend

Independent TypeScript SMS/USSD service for HealthAccess. It uses Africa's Talking,
the shared Prisma schema in `../online/prisma/schema.prisma` (migrations under
`../online/prisma/migrations`), Vercel AI SDK with OpenRouter, and Serper. It never
calls the online HTTP service.

Project-wide architecture, database contract and current status are in
[`../../docs/README.md`](../../docs/README.md).

## Run

Requires Node 24+ and PostgreSQL 16+.

```sh
npm install
npm run keys:generate
npm run typecheck
npm test
npm run build
npm start
```

Run `npm run worker` in another process. During development use `npm run dev`
and `npm run dev:worker`. The HTTP process only accepts callbacks and handles
deterministic USSD; the worker processes SMS and sends queued replies.

`.env.example` contains the essential settings. `CODE_DIGEST_KEY` must be the same
as the online service; use a separate `DATA_ENCRYPTION_KEY`. Keep both
keys backed up securely. Changing them is a data/key migration, not an ordinary
configuration update. Do not commit `.env`.

Apply the shared migrations with an administrator/owner connection:

```sh
DATABASE_URL='postgresql://ADMIN:password@localhost/healthaccess' npm run db:migrate
```

Provision a separate runtime login, then put its connection URL in `.env`:

```sql
CREATE ROLE healthaccess_offline LOGIN PASSWORD 'replace-with-a-secret';
GRANT USAGE ON SCHEMA public TO healthaccess_offline;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO healthaccess_offline;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO healthaccess_offline;
```

Granting on `ALL TABLES` must be repeated after a migration adds tables. Never use
the administrator URL at runtime. The service verifies its Prisma connection on
startup. Remote database connections should use verified TLS, for example
`sslmode=verify-full`, with the CA in the system trust store or supplied through
Node's `NODE_EXTRA_CA_CERTS`. Both subprojects share the schema, not a second copy
of patient records.

## Africa's Talking

Use the provisioned two-way shortcode/number for `AT_SMS_FROM`, not an outbound-only
alphanumeric sender. Use the actual service code for `AT_USSD_SERVICE_CODE`.
Sandbox username is `sandbox`; live credentials and provisioning are separate.

Configure these public HTTPS callbacks using your `CALLBACK_TOKEN`:

| Callback           | Path                                             |
| ------------------ | ------------------------------------------------ |
| Incoming SMS       | `/callbacks/africastalking/<token>/sms/inbound`  |
| Delivery report    | `/callbacks/africastalking/<token>/sms/delivery` |
| USSD               | `/callbacks/africastalking/<token>/ussd`         |
| USSD session event | `/callbacks/africastalking/<token>/ussd/events`  |

There is no assumed Africa's Talking HMAC header. In development and test,
callbacks are accepted from any source at the secret callback path, so a sandbox
tunnel works without IP configuration. This is intentionally relaxed for testing.
Production startup requires `CALLBACK_ALLOWED_IPS`; forwarded client-IP headers
are never trusted. Set `HOST=0.0.0.0` when the app must listen beyond loopback;
the public endpoint must still terminate HTTPS. Local development binds to
`127.0.0.1` by default.

No `AT_API_KEY` means mock sending with no telecom network requests. Mock
acceptance is not handset delivery. Real SMS replies are sent through the API,
not returned in the incoming webhook body. An ambiguous send timeout is `unknown`
and is never blindly retried. Investigate unknown jobs with the provider before
resubmitting them.

## Sandbox testing

1. Apply migrations and optional clearly labeled demo data:

```sh
DATABASE_URL='postgresql://ADMIN:password@localhost:5432/healthaccess' npm run db:migrate
DATABASE_URL='postgresql://ADMIN:password@localhost:5432/healthaccess' npm run db:seed-demo
```

The demo seed creates a real, searchable `Ikeja` area (not demo-flagged), reference
field definitions and services, and demo patient code `123456789012` for sandbox auth
only. It creates no facility fixtures: facility results come from approved non-demo
directory rows or from live Serper search, and demo rows are always excluded.

2. Start both processes in separate terminals:

```sh
npm run dev
npm run dev:worker
```

3. Expose the local server with an HTTPS tunnel:

```sh
ngrok http 3001
# or: cloudflared tunnel --url http://localhost:3001
```

4. Copy `CALLBACK_TOKEN` from `.env` and set these sandbox callback URLs:
   `https://<tunnel>/callbacks/africastalking/<CALLBACK_TOKEN>/sms/inbound`,
   `.../sms/delivery`, `.../ussd`, and `.../ussd/events` where available.
   Development accepts callbacks from any source, but the secret token path must match.

5. Open the Africa's Talking simulator at
   <https://simulator.africastalking.com:1517/>, register a test number, text the
   configured shortcode, or dial the configured
   USSD code shown in `.env` for this environment. Sandbox interactions occur in
   the simulator, not on a handset.

Suggested USSD path: dial, choose `1`, choose `2` for child health, enter `Ikeja`.
Emergency summary: dial, choose `2`, enter `123456789012`.
Live emergency help: dial, choose `4`, enter `Ikeja`; results are live, unverified
leads with 112 guidance and `1. Next` paging.
Suggested SMS: `HELP`, `FIND child health near Ikeja`, `LOOKUP 123456789012`,
`EMERGENCY Ikeja`, `EMERGENCY near Ikeja`, `MORE`, `CANCEL`, `STOP`. The worker must be
running to process SMS and send replies.

## User Flows

- SMS: `HELP`, `FIND child health near Ikeja`, `LOOKUP <12-digit code>`,
  `EMERGENCY [near] <area>`, `ASK <general health question>`, `MORE`, `CANCEL`, `STOP`.
- USSD: nearby care, live emergency help with 112 guidance, patient-selected emergency
  summary, and additional selected details using both the patient code and a live
  USSD-enabled temporary grant.
- When the approved directory has no non-demo facility for an area, care search falls
  back to live Serper web leads that are clearly labeled unverified. Emergency help
  always calls Serper Maps for "emergency hospital" and "ambulance service" in parallel.
  If live search is unavailable, the reply tells the user to call 112 or go to the
  nearest emergency department; no facility is ever invented.
- Emergency requests are recorded best-effort (`EmergencyRequest` channel SMS/USSD).
- Every protected page, including a repeated callback, checks current permissions.
  Additional grant details are never automatically forwarded by SMS.

Nigeria and English are the initial supported pilot. Operational defaults are
in `src/config.ts`: 120-second USSD sessions, 15-minute SMS clarification windows,
seven-day encrypted message retention, and six SMS segments. Optional profile
personalization is off by default. Do not enable it without reviewed matching
rules, verified phone links, scoped consent and per-search confirmation.

## AI And Web Data

Set both `OPENROUTER_API_KEY` and an explicit `OPENROUTER_MODEL` to enable the
Vercel AI SDK integration. Reusable prompts live in `../prompts/`. No key/model
means deterministic commands and safe fallback text still work.

Serper uses `SERPER_API_KEY`. Approved directory services are filtered before
distance ranking. Web facility leads remain explicitly unverified, not confirmed
suitable-care recommendations. Source references are retained. Web-based health
information is limited to configured public-health domains, cited, and labeled
as AI-assisted and not clinically reviewed. Search snippets are not a diagnosis,
prescription, or proof of service availability. No external page scripts are run.

Patient codes, access codes, phone identifiers and stored profile fields are not
model/search context. Free-text users can still volunteer identifying information;
this is not a guarantee of automatic de-identification. Review provider data
handling and consent before processing real patient messages.

## Verification

```sh
npm run typecheck
npm test
npm run test:db
npm run build
```

`test:db` uses `TEST_DATABASE_URL` or `DATABASE_URL` from `.env`; it runs the
shared Prisma migrations' public schema and removes its own fixtures. Use a
disposable database that already has `npm run db:migrate` applied. Never point it
at a live database. Logs omit
callback bodies, medical values, access codes and credentials. Disable body/URL
logging at proxies and tracing systems too.

Before a real pilot, verify the provisioned callback fixtures, provider IP controls,
operator menu/deadline limits, directory/clinical content, delivery reports and
real-SIM behavior (including Unicode medical fields) with mobile data disabled.
Voice remains outside this release.

Provider contracts were checked against the official [SMS notifications](https://developers.africastalking.com/docs/sms/notifications),
[SMS sending](<https://developers.africastalking.com/docs/sms/sending/bulk_(legacy)>),
[USSD sessions](https://developers.africastalking.com/docs/ussd/handle_sessions), and
[USSD events](https://developers.africastalking.com/docs/ussd/notifications) documentation.
