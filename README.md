# POSHA

POSHA is a mobile-first platform for adults, with age-gated accounts, private conversations, creator tools, and live experiences. Its product, API, data, safety, design, and testing requirements are documented in [`docs/spec/`](docs/spec/).

## Project status

Work follows the ordered backlog in [`docs/spec/09_BACKLOG.md`](docs/spec/09_BACKLOG.md). [`PROGRESS.md`](PROGRESS.md) is the source of truth for completed tasks, verification, and external blockers; [`docs/DECISIONS.md`](docs/DECISIONS.md) records implementation choices.

The workspace currently includes a React/Vite web app and a NestJS API. The API bootstrap currently serves `GET /api/v1/health`; additional auth, Connect, safety, moderation, and video services are being implemented as modules and are not all mounted in the running application yet. Random video remains unavailable: `GATE:RANDOM_VIDEO` is OFF, live media transport is not connected, and P3-04 is waiting on the LiveKit browser client and a test SFU.

## Requirements

- Node.js 20.19 or later (Node.js 22 is supported)
- pnpm 10, available through Corepack
- Docker Compose only when you want the local Postgres, Redis, MinIO, and Mailpit services

Install workspace dependencies from the repository root:

```sh
corepack pnpm install
```

## Run the applications

Start the API in one terminal:

```sh
corepack pnpm --filter @posha/api start:dev
```

The API listens on port `3000` by default. Its liveness endpoint is `http://localhost:3000/api/v1/health`.

Start the web app in another terminal:

```sh
corepack pnpm --filter @posha/web dev
```

Vite prints the local web URL when it starts (usually `http://localhost:5173`). To use a different API address from the browser, set `VITE_API_BASE_URL` when starting Vite, for example:

```sh
VITE_API_BASE_URL=http://localhost:3000 corepack pnpm --filter @posha/web dev
```

The current API bootstrap only mounts the health route, so auth and product flows that call other API routes will not work end to end yet.

## Local infrastructure

Copy the development-only environment template and start the local services:

```sh
cp .env.example .env
docker compose -f infra/docker-compose.yml up -d
```

The Compose stack provides Postgres, Redis, MinIO, and Mailpit. LiveKit is an optional `media-dev` profile. Mailpit is available at `http://localhost:8025`; MinIO's console is at `http://localhost:9001`. Template credentials are only for local development and must never be reused in production.

Apply or roll back database migrations after Postgres is ready:

```sh
corepack pnpm --filter @posha/api db:migrate
corepack pnpm --filter @posha/api db:rollback
```

Validate the neutral seed fixtures with:

```sh
corepack pnpm seed:validate
```

## Quality checks

Run from the repository root:

```sh
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
corepack pnpm format:check
node scripts/check-spec-coverage.mjs
```

API tests that require PostgreSQL use `TEST_DATABASE_URL`. A local database can be started with the Compose instructions above.

## Safety and feature gates

Every `GATE:*` feature remains OFF until its required approvals and evidence are recorded. Do not enable production gates from local development. Age assurance, payments, creator monetization, live rooms, and random video depend on their documented provider, moderation, legal, and operational prerequisites.
