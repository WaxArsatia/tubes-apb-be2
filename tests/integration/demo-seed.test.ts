import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import { demoSeedEmail, demoSeedPassword, ensureDemoSeed } from '../../src/db/seed'
import { authHeaders, closeDatabase, json, prepareDatabase, request } from '../helpers/app'
import { sql } from '../../src/db/client'

beforeEach(prepareDatabase)
afterAll(closeDatabase)

async function loginAsDemo() {
  const res = await request('/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: demoSeedEmail, password: demoSeedPassword }),
  })
  const body = await json(res)
  expect(res.status).toBe(200)
  return body.data.accessToken as string
}

async function demoRecordCounts() {
  const rows = await sql<{ categories: number; transactions: number; savings: number }[]>`
    select
      (select count(*)::int from categories c join users u on u.id = c.user_id where lower(u.email) = lower(${demoSeedEmail})) as categories,
      (select count(*)::int from transactions t join users u on u.id = t.user_id where lower(u.email) = lower(${demoSeedEmail})) as transactions,
      (select count(*)::int from savings s join users u on u.id = s.user_id where lower(u.email) = lower(${demoSeedEmail})) as savings
  `
  return rows[0]
}

describe('demo seed integration', () => {
  test('creates a login-ready public demo account with endpoint-visible data once', async () => {
    await ensureDemoSeed()

    const accessToken = await loginAsDemo()
    const categories = await json(await request('/categories', { headers: authHeaders(accessToken) }))
    const transactions = await json(await request('/transactions', { headers: authHeaders(accessToken) }))
    const savings = await json(await request('/savings', { headers: authHeaders(accessToken) }))
    const activities = await json(await request('/activities/recent', { headers: authHeaders(accessToken) }))
    const firstCounts = await demoRecordCounts()

    expect(categories.data.length).toBeGreaterThanOrEqual(6)
    expect(transactions.data.length).toBeGreaterThanOrEqual(6)
    expect(savings.data.length).toBeGreaterThanOrEqual(4)
    expect(activities.data.length).toBeGreaterThan(0)

    await ensureDemoSeed()

    expect(await demoRecordCounts()).toEqual(firstCounts)
  })
})
