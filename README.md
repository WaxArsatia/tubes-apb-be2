# FinU Backend

Bun + Hono backend for the FinU Flutter API contract in `docs/openapi.yaml`.

## Local Development

```sh
bun install
cp .env.example .env
bun run dev
```

The API listens on `http://localhost:3000` by default. `GET /health` reports service and database readiness.

## Database

Drizzle schema lives in `src/db/schema.ts`; generated migrations live in `migrations/`.

```sh
bun run db:generate
bun run db:migrate
```

When `AUTO_MIGRATE=true`, the API applies pending Drizzle migrations on startup.

## Tests

Unit and contract tests do not need Docker. Integration tests use PostgreSQL on host port `5433`.

```sh
docker compose up -d postgres
bun run test
docker compose down
```

Use `bun run contract:check` to compare implemented routes against `docs/openapi.yaml`.

## Docker VPS Stack

```sh
cp .env.example .env
docker compose build
docker compose up -d
```

The compose file runs the API and PostgreSQL with persistent volumes for database data and profile uploads. Configure TLS and domain routing in an external reverse proxy.
