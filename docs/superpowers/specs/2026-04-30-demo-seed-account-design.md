# Demo Seed Account Design

## Goal

Create a public-demo-ready account with full dummy financial data automatically on every application boot. The seed must be safe to rerun and must not create duplicate demo data.

## Configuration

No environment gate controls demo seeding. The demo account is always ensured on boot in every environment, including production.

## Demo Credentials

Use stable public demo credentials:

- Email: `demo@finu.local`
- Password: `password123`

These credentials are intentionally dummy-only and suitable for public presentation.

## Boot Flow

The application boot sequence remains migration-first:

1. Load config.
2. Run `ensureSchema()` when `AUTO_MIGRATE=true`.
3. Run `ensureDemoSeed()`.
4. Create and export the Hono app.

This keeps the seed dependent on an up-to-date schema and avoids seeding before tables exist.

## Seed Data

The seed creates one demo user and enough related data to exercise the visible API surface:

- Expense categories with icons and monthly budgets.
- Saving categories with icons and saving targets.
- General income entries so budgeted expense categories are valid.
- Saving entries linked to saving categories.
- Expense transactions linked to expense categories.

The values must be realistic Indonesian Rupiah demo data and spread across recent dates so list, month filter, budget warning, saving target, and recent activity screens have meaningful content.

## Idempotency

The seed is account-level idempotent:

- If a user with email `demo@finu.local` already exists, seeding exits without changing data.
- If the user does not exist, the seed creates the user and all dummy data inside a single database transaction.

This avoids duplicate categories and records on every boot, and it avoids partial demo data if an insert fails.

## Implementation Shape

Add a focused seed module, `src/db/seed.ts`, with:

- Exported constants for the demo email and password.
- An exported `ensureDemoSeed()` function.
- Local data arrays for categories, income, savings, and transactions.

Use the existing `sql` tagged template and `hashValue()` helper so password handling matches normal registration.

## Tests

Add integration coverage that:

- Resets and migrates the test database.
- Runs `ensureDemoSeed()`.
- Verifies login works with the public credentials.
- Verifies categories, transactions, savings, and recent activity have data.
- Runs `ensureDemoSeed()` a second time and verifies counts do not increase.
