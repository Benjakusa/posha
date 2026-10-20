# POSHA

POSHA is a mobile-first platform. The authoritative product and engineering specifications live in [`docs/spec/`](docs/spec/).

## Development

- Node.js 20.19+ LTS (22 is supported for local development)
- pnpm 10

Run `corepack pnpm install`. Use `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test`, and `corepack pnpm build` from the repository root.

For local dependencies, copy `.env.example` to `.env`, then run `docker compose -f infra/docker-compose.yml up -d`. LiveKit is opt-in with `--profile media-dev`. Mailpit is available at `http://localhost:8025`; MinIO's console is at `http://localhost:9001`. Local credentials are for development only. Run `pnpm seed:validate` to validate the neutral profile fixtures.

All production feature gates remain off until the owner records the required approval evidence.
