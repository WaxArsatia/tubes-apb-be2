import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import { closeDatabase, json, prepareDatabase, request } from '../helpers/app'

beforeEach(prepareDatabase)
afterAll(closeDatabase)

describe('protected routes and error envelope', () => {
  test('requires bearer token', async () => {
    const res = await request('/profile')
    const body = await json(res)
    expect(res.status).toBe(401)
    expect(body.error.code).toBe('UNAUTHENTICATED')
  })

  test('returns validation errors in standard envelope', async () => {
    const res = await request('/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: '', email: 'bad', password: 'short' }),
    })
    const body = await json(res)
    expect(res.status).toBe(400)
    expect(body.error.code).toBe('VALIDATION_ERROR')
    expect(Array.isArray(body.error.details)).toBe(true)
  })
})
