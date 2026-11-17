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
docker-compose.yml local Postgres 16, Redis 7 and MinIO
.github/workflows/ unit/typecheck CI
```

## Quick start

Prerequisites: Node 24+, npm 11+, Docker (or a local PostgreSQL 16).

```sh
npm install
docker compose up -d postgres redis minio

cp backend/online/.env.example backend/online/.env
cp backend/offline/.env.example backend/offline/.env
# Fill required values. Never commit .env. For the compose database use
# DATABASE_URL=postgresql://healthaccess@localhost:5432/healthaccess
# JWT_SECRET, CODE_DIGEST_KEY and DATA_ENCRYPTION_KEY are required.

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
