# syntax=docker/dockerfile:1

# One image for the online API, the offline callback server, the offline worker
# and the one-shot migration job. Compose overrides the command per service.

FROM node:24-bookworm AS build
WORKDIR /app

# bcrypt may compile from source; Prisma engines need OpenSSL.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Workspace manifests first so dependency layers cache independently of source.
COPY .npmrc package.json package-lock.json ./
COPY backend/shared/package.json backend/shared/package.json
COPY backend/online/package.json backend/online/package.json
COPY backend/offline/package.json backend/offline/package.json

RUN npm ci

COPY backend ./backend
# The online /docs route serves this from ../../../docs/api/index.html.
COPY docs ./docs

# Prisma generate only needs a syntactically valid URL; it does not connect.
ENV DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build"

RUN node docs/api/build.mjs \
  && npm run build:shared \
  && npm run db:generate \
  && npm run build:online \
  && npm run build:offline

FROM node:24-bookworm-slim AS runtime
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates tzdata \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production

# Includes node_modules, the generated Prisma client, dist output, prisma schema
# and migrations, and the Prisma CLI used by the migrate service.
COPY --from=build /app /app

EXPOSE 3000 3001

CMD ["node", "backend/online/dist/server.js"]
