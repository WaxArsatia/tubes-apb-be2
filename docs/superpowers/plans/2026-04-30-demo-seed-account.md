# Demo Seed Account Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an unconditional boot-time demo account seed with public dummy credentials and rich finance data.

**Architecture:** Startup calls the seed after migrations, and a focused `src/db/seed.ts` module owns idempotent account/data creation. Tests cover login-ready seeded data, endpoint-visible dummy data, and idempotency.

**Tech Stack:** Bun, TypeScript, Hono, Postgres, Drizzle schema/migrator, `postgres` tagged SQL, Bun test.

---

## File Structure

- Modify `src/config.ts`: keep normal app config without a demo seed gate.
- Create `src/db/seed.ts`: define demo credentials, seed data arrays, and `ensureDemoSeed()`.
- Modify `src/index.ts`: call `ensureDemoSeed()` after migrations.
- Modify `tests/helpers/app.ts`: expose helpers to count demo records if needed by tests.
- Modify `tests/unit/config.test.ts`: keep config tests focused on remaining config behavior.
- Create `tests/integration/demo-seed.test.ts`: test login, seeded API data, and idempotency.
- Modify `package.json`: include the new integration test in `test:integration`.

## Task 1: Remove Config Gate

**Files:**
- Modify: `src/config.ts`
- Test: `tests/unit/config.test.ts`

- [x] Step 1: Remove config tests for `demoSeedEnabled`.

Remove assertions that reference:

```ts
demoSeedEnabled
DEMO_SEED_ENABLED
```

- [x] Step 2: Run `bun test tests/unit/config.test.ts`.

Expected: PASS.

- [x] Step 3: Update `src/config.ts`.

Remove:

```ts
DEMO_SEED_ENABLED
demoSeedEnabled
```

- [x] Step 4: Run `bun test tests/unit/config.test.ts`.

Expected: PASS.

## Task 2: Seed Module

**Files:**
- Create: `src/db/seed.ts`
- Test: `tests/integration/demo-seed.test.ts`

- [x] Step 1: Add failing integration tests.

Tests must reset/migrate the DB, call `ensureDemoSeed()`, log in with `demo@finu.local` / `password123`, assert non-empty `/categories`, `/transactions`, `/savings`, and `/activities/recent`, then call `ensureDemoSeed()` again and assert counts remain unchanged.

- [x] Step 2: Run `NODE_ENV=test AUTO_MIGRATE=true DATABASE_URL=postgres://finu:finu@localhost:5433/finu bun test tests/integration/demo-seed.test.ts`.

Expected: FAIL because `src/db/seed.ts` does not exist.

- [x] Step 3: Implement `src/db/seed.ts`.

Create:

```ts
export const demoSeedEmail = 'demo@finu.local'
export const demoSeedPassword = 'password123'
export async function ensureDemoSeed() { ... }
```

Use `findUserByEmail(demoSeedEmail)` for idempotency. If the account exists, return. Otherwise insert the user, categories, general income, savings, and transactions inside `sql.begin()`. Use `hashValue(demoSeedPassword)` for the password.

- [x] Step 4: Run the demo seed integration test.

Expected: PASS.

## Task 3: Boot Wiring

**Files:**
- Modify: `src/index.ts`

- [x] Step 1: Import `ensureDemoSeed` from `./db/seed`.

- [x] Step 2: After `ensureSchema()`, add:

```ts
await ensureDemoSeed(config)
```

Change it to:

```ts
await ensureDemoSeed()
```

- [x] Step 3: Run `bun run typecheck`.

Expected: PASS.

## Task 4: Test Script and Full Verification

**Files:**
- Modify: `package.json`

- [x] Step 1: Add `tests/integration/demo-seed.test.ts` to `test:integration`.

- [x] Step 2: Run:

```bash
bun run test:unit
bun run contract:check
NODE_ENV=test AUTO_MIGRATE=true DATABASE_URL=postgres://finu:finu@localhost:5433/finu bun test tests/integration/demo-seed.test.ts
bun run typecheck
```

Expected: all PASS.

- [x] Step 3: Commit code changes.

```bash
git add src/config.ts src/index.ts src/db/seed.ts tests/unit/config.test.ts tests/integration/demo-seed.test.ts package.json docs/superpowers/plans/2026-04-30-demo-seed-account.md
git commit -m "feat: make demo seed unconditional"
```

## Self-Review

- Spec coverage: unconditional boot execution, idempotency, dummy data, credentials, and tests are covered.
- Placeholder scan: no TBD/TODO/fill-in placeholders are present.
- Type consistency: `ensureDemoSeed`, `demoSeedEmail`, and `demoSeedPassword` are consistently named.
