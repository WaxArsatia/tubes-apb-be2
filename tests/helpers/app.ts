import { createApp } from '../../src/app'
import type { Config } from '../../src/config'
import { ensureSchema, resetDatabaseForTests, resetSchemaForTests, sql } from '../../src/db/client'
import { testEmailOutbox } from '../../src/services/email'

export const testConfig: Config = {
  nodeEnv: 'test',
  port: 0,
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://finu:finu@localhost:5432/finu',
  jwtAccessSecret: 'test-access-secret-that-is-long-enough',
  jwtRefreshSecret: 'test-refresh-secret-that-is-long-enough',
  smtp: {
    host: 'test',
    port: 1025,
    user: 'test',
    pass: 'test',
    from: 'noreply@example.com',
  },
  uploadDir: 'uploads-test',
  publicBaseUrl: 'http://localhost:3000',
  autoMigrate: true,
  enableDemoSeed: false,
}

export const app = createApp(testConfig)
let initialized = false

export async function prepareDatabase() {
  if (!initialized) {
    await resetSchemaForTests()
    await ensureSchema()
    initialized = true
  }
  await resetDatabaseForTests()
  testEmailOutbox.length = 0
}

export async function closeDatabase() {
  await sql.end({ timeout: 1 })
}

export async function request(path: string, init: RequestInit = {}) {
  return app.request(path, init)
}

export async function json(res: Response) {
  return res.json() as Promise<any>
}

export async function registerUser(email = `user-${crypto.randomUUID()}@example.com`) {
  const res = await request('/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Alya', email, password: 'password123' }),
  })
  const body = await json(res)
  return { res, body, email, accessToken: body.data.accessToken as string, refreshToken: body.data.refreshToken as string }
}

export function authHeaders(accessToken: string, extra?: HeadersInit): HeadersInit {
  return { authorization: `Bearer ${accessToken}`, ...(extra ?? {}) }
}

export async function createSavingIncome(accessToken: string, amount = 5_000_000) {
  const res = await request('/savings', {
    method: 'POST',
    headers: authHeaders(accessToken, { 'content-type': 'application/json' }),
    body: JSON.stringify({ type: 'general_income', amount, date: '2026-04-01' }),
  })
  return json(res)
}

export async function createCategory(accessToken: string, input: Record<string, unknown>) {
  const res = await request('/categories', {
    method: 'POST',
    headers: authHeaders(accessToken, { 'content-type': 'application/json' }),
    body: JSON.stringify(input),
  })
  return json(res)
}
