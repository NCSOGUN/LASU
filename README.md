# HealthAccess

HealthAccess is a patient-controlled emergency health summary and care
navigation service. A patient chooses a small emergency profile, can share it by
a short code, and can find suitable care. SMS and USSD keep the same access
available on a basic phone without mobile data.

This repository is a TypeScript monorepo with three workspaces:

- `backend/online` - Express 5 + Prisma API for the patient portal, grants and
  consent, directory, symptom chat, medication tracking and reminders.
- `backend/offline` - independent SMS/USSD service for a basic phone. It shares
  the database and crypto contract but never calls the online API.
- `backend/shared` - shared crypto, access policy, projections and types.

PostgreSQL 16 is the single database. `backend/online/prisma/schema.prisma` is
the source of truth. The old SQL schemas, routines and FastAPI plan are retired.

## Status

The backend feature phases are implemented and verified: the Prisma schema and
both migrations exist, the online API boots with health checks, and the seed
creates reference data plus clearly labeled demo fixtures. The online API covers
auth/users, portal/grants, directory, symptom chat/AI and medications with
reminders; the offline SMS/USSD service is Prisma-backed. Workspace typecheck is
clean, the shared suite passes 4/4, offline unit tests 71/71, offline Prisma
integration 20/20, and the online DB suite 78/78. Live FCM delivery, real
Africa's Talking provisioning and production monitoring remain unverified. There
is no frontend application yet. See [`docs/README.md`](docs/README.md).

## Repository map

```text
backend/
  shared/          @healthaccess/shared crypto/policy/projection/types
  online/          @healthaccess/online Express 5 API and Prisma schema
    prisma/        schema, migrations, seed
    src/           app, routes, middleware, modules, services
  offline/         @healthaccess/offline SMS/USSD HTTP process and worker
    src/           callbacks, channels, repository, worker
    tests/         unit and Prisma DB integration tests
docs/              architecture, database, operations, integration plan
frontend/          placeholder only
plans/             retired HTML planning documents
docker-compose.yml deploys online, offline (server + worker), docs, PostgreSQL and Redis; S3/MinIO is external
.github/workflows/ unit/typecheck CI
```

## Quick start

Prerequisites: Node 24+, npm 11+, and a PostgreSQL 16 instance. Redis and
S3/MinIO are optional unless you enable those features. The repository compose
file does not start infrastructure; it deploys the application services against
the instances you already run.

```sh
npm install

cp backend/online/.env.example backend/online/.env
cp backend/offline/.env.example backend/offline/.env
# Fill required values and point them at your PostgreSQL/Redis/S3 instances.
# Never commit .env. JWT_SECRET, CODE_DIGEST_KEY and DATA_ENCRYPTION_KEY are
# required, and CODE_DIGEST_KEY / DATA_ENCRYPTION_KEY must match in both files.

npm run db:migrate
npm run db:seed
npm run dev:online
```

The online API listens on `http://localhost:3000`; check `/health/live` and
`/health/ready`. The versioned route prefix is `/v1`.

The offline service runs two processes:

```sh
npm run dev:offline
npm run dev:worker
```

The offline service uses the same Prisma schema and migrations as online, so no
second schema or `db:apply` step is needed. Its full DB integration run needs a
disposable database; see [`docs/operations.md`](docs/operations.md).

## Docker deployment

`docker-compose.yml` builds one backend image and runs:

| Service | Default port | Purpose |
| --- | --- | --- |
| `postgres` | internal 5432 | PostgreSQL 16 with the `healthaccess_pgdata` volume |
| `redis` | internal 6379 | Redis 7 with AOF persistence |
| `migrate` | - | one-shot `prisma migrate deploy`, runs first |
| `online` | 3000 | Express API and `/docs` |
| `offline` | 3001 | SMS/USSD callback server |
| `offline-worker` | - | SMS outbox and conversation worker |
| `docs` | 8080 | standalone API reference with a same-origin `/v1` proxy |

PostgreSQL and Redis are included and are not published on the host by default.
S3/MinIO is not included; set its details in `backend/online/.env` if you use
uploads. The compose sets `DATABASE_URL` and `REDIS_URL` for the backend
containers, so the `localhost` values in the env files only matter when you run a
service directly with npm. The backend env files must still agree on
`CODE_DIGEST_KEY`, `DATA_ENCRYPTION_KEY` and `ENCRYPTION_KEY_VERSION`.

The default Postgres password is `healthaccess`. For anything beyond local
testing, copy `.env.example` to `.env` and set `POSTGRES_PASSWORD` before the
first start. Changing it after the database volume exists requires resetting
that volume. Use a URL-safe password or URL-encode it in `DATABASE_URL`. The
included Postgres uses its owner account; a production deployment should use a
least-privilege role or an external managed database.

### Which env file is used?

| Container | Reads | Main values |
| --- | --- | --- |
| `online`, `migrate` | `backend/online/.env` | JWT, S3, AI, `FRONTEND_URL`; DB/Redis come from compose |
| `offline`, `offline-worker` | `backend/offline/.env` | callback token, Africa's Talking, AI; DB comes from compose |
| `postgres` | compose | `POSTGRES_PASSWORD` |
| `redis` | compose | no password; internal network only |
| `docs` | none | static page plus the `/v1` proxy |
| Compose itself | optional root `.env` | `POSTGRES_PASSWORD`, `${TZ}`, ports |

A root `.env` is not passed wholesale into the containers; it only supplies the
values above for Compose. The two backend env files still hold the JWT, crypto,
Africa's Talking, S3 and AI settings. If you replace the included Postgres/Redis
with external services, change the compose `DATABASE_URL`/`REDIS_URL` to a host
the containers can reach.

Each backend container reads `NODE_ENV` from its own env file. The examples ship
with `development` (sandbox/mock SMS). For a live deployment, set
`NODE_ENV=production` in both env files; that requires live Africa's Talking
credentials (`AT_USERNAME` not `sandbox`, `AT_API_KEY`), the provisioned
`AT_SMS_FROM` and `AT_USSD_SERVICE_CODE`, and `CALLBACK_ALLOWED_IPS`.

```sh
docker compose up -d --build
docker compose run --rm online npm run db:seed   # optional demo fixtures
docker compose ps
docker compose logs -f online
```

Then open:

- `http://localhost:3000/v1` for the API
- `http://localhost:3000/docs` for the reference served by the API
- `http://localhost:8080` for the standalone docs site (Try It proxies `/v1` to `online`)
- `http://localhost:3001` for the Africa's Talking callbacks

From another machine, replace `localhost` with the server IP or domain. The
compose publishes plain HTTP; put your reverse proxy/TLS in front for production.

Override published ports with `ONLINE_PORT`, `OFFLINE_PORT`, `DOCS_PORT` and the
timezone with `TZ` (default `Africa/Lagos`). A new migration rebuilds the image
and re-runs the `migrate` service on `up --build`.

`docker compose down` stops the stack; `docker compose down -v` also deletes the
Postgres and Redis volumes.

For keys, environment details, sandbox callbacks and troubleshooting, read
[`docs/operations.md`](docs/operations.md).

## Demo fixtures

`npm run db:seed` is idempotent and creates reference data plus clearly labeled
demo fixtures:

- 15 field definitions, including emergency-eligible name, date of birth,
  allergies, current medications, conditions, blood group and emergency contact.
- 3 services: `general`, `pediatrics`, `maternity`.
- Demo area `Ikeja`, demo facilities `Demo Community Hospital` and `Demo Child
  Health Clinic` (both approved and `is_demo`), with `general` and `pediatrics`
  facility services.
- Demo patient `demo.patient@example.test` with demo password `DemoPass123!`,
  patient code `123456789012`, five profile values and emergency fields for
  allergies and emergency contact.

The demo credentials are fixtures, not production credentials. Demo facilities
are `is_demo` and renderers label them `DEMO`. Do not present them as an approved
real directory. `backend/offline/scripts/seed-demo.ts` writes the same Prisma
fixtures for offline sandbox testing; the online seed is the canonical step.

## Tests

```sh
npm run typecheck
npm run build

# unit tests that do not need a database
npm run test --workspace @healthaccess/shared
npm run test --workspace @healthaccess/offline
```

Current results: typecheck clean, shared 4/4, offline unit 71/71. The offline
Prisma integration suite passes 20/20 against a disposable database. `npm test`
at the root runs every workspace, including the online DB integration suite, so
it needs a configured database; use the two workspace commands above for a
database-free run.

The online tests under `backend/online/tests/` exercise PostgreSQL and are DB
integration tests, so CI does not run them. Run them locally against a
disposable database:

```sh
cd backend/online
node --env-file-if-exists=.env --test --import tsx tests/*.test.ts
```

The offline DB integration suite needs a disposable database:

```sh
cd backend/offline
TEST_DATABASE_URL='postgresql://<admin>:<password>@localhost:5432/healthaccess_test' npm run test:db
```

Never point integration tests at a live database. See
[`docs/operations.md`](docs/operations.md) for the full command set.

## Documentation

- [`docs/README.md`](docs/README.md) - product, current status, repo map and
  quick start.
- [`docs/architecture.md`](docs/architecture.md) - components, auth, AI,
  reminders, offline flows and security.
- [`docs/database.md`](docs/database.md) - Prisma schema, table groups, queue
  semantics and crypto contract.
- [`docs/operations.md`](docs/operations.md) - environment, local setup, sandbox
  testing, tests and production checklist.
- [`docs/api/index.html`](docs/api/index.html) - Postman-style API reference with
  captured request and response examples. `npm run docs:api` rebuilds it.
- [`docs/integration-plan.md`](docs/integration-plan.md) - parallel-work contract
  and ownership map.
