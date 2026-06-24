import { afterEach, describe, expect, test } from 'bun:test'
import { Hono } from 'hono'
import { createApp } from '../../src/app'
import type { AppEnv } from '../../src/app'
import { AppError, handleError } from '../../src/http/errors'
import { requestLogger } from '../../src/http/request-logger'
import { testConfig } from '../helpers/app'

const originalInfo = console.info

afterEach(() => {
  console.info = originalInfo
})

describe('request logging', () => {
  test('logs safe request and response metadata with a request id', async () => {
    const logs: string[] = []
    console.info = (message?: unknown) => {
      logs.push(String(message))
    }

    const app = createApp(testConfig)
    const res = await app.request('/auth/register?invite=secret-token', {
      method: 'POST',
      headers: {
        authorization: 'Bearer secret-access-token',
        'content-type': 'application/json',
        'x-request-id': 'request-123',
      },
      body: JSON.stringify({ name: '', email: 'bad', password: 'secret-password' }),
    })

    expect(res.headers.get('x-request-id')).toBe('request-123')
    expect(logs).toHaveLength(2)

    const started = JSON.parse(logs[0])
    const completed = JSON.parse(logs[1])

    expect(started).toMatchObject({
      level: 'info',
      event: 'request.started',
      requestId: 'request-123',
      method: 'POST',
      path: '/auth/register',
    })
    expect(started).not.toHaveProperty('status')
    expect(started).not.toHaveProperty('durationMs')

    expect(completed).toMatchObject({
      level: 'info',
      event: 'request.completed',
      requestId: 'request-123',
      method: 'POST',
      path: '/auth/register',
      status: 400,
    })
    expect(typeof completed.durationMs).toBe('number')
    expect(completed.durationMs).toBeGreaterThanOrEqual(0)

    const joinedLogs = logs.join('\n')
    expect(joinedLogs).not.toContain('secret-access-token')
    expect(joinedLogs).not.toContain('secret-token')
    expect(joinedLogs).not.toContain('secret-password')
  })

  test('logs completed response metadata when a route throws', async () => {
    const logs: string[] = []
    console.info = (message?: unknown) => {
      logs.push(String(message))
    }

    const app = new Hono<AppEnv>()
    app.use('*', requestLogger())
    app.get('/boom', () => {
      throw new AppError('CONFLICT', 'Already exists', 409)
    })
    app.onError(handleError)

    const res = await app.request('/boom')

    expect(res.status).toBe(409)
    expect(logs).toHaveLength(2)

    const completed = JSON.parse(logs[1])
    expect(completed).toMatchObject({
      level: 'info',
      event: 'request.completed',
      method: 'GET',
      path: '/boom',
      status: 409,
    })
    expect(typeof completed.requestId).toBe('string')
    expect(typeof completed.durationMs).toBe('number')
  })
})
