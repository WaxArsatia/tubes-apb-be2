import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import { closeDatabase, json, prepareDatabase, registerUser, request } from '../helpers/app'
import { testEmailOutbox } from '../../src/services/email'

beforeEach(prepareDatabase)
afterAll(closeDatabase)

describe('auth integration', () => {
  test('registers, logs in, refreshes once, revokes old refresh token, and logs out', async () => {
    const registered = await registerUser('auth@example.com')
    expect(registered.res.status).toBe(201)
    expect(registered.body.data.tokenType).toBe('Bearer')

    const loginRes = await request('/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'auth@example.com', password: 'password123' }),
    })
    const loginBody = await json(loginRes)
    expect(loginRes.status).toBe(200)
    expect(loginBody.data.accessToken).toBeString()

    const refreshRes = await request('/auth/refresh', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken: loginBody.data.refreshToken }),
    })
    const refreshBody = await json(refreshRes)
    expect(refreshRes.status).toBe(200)
    expect(refreshBody.data.refreshToken).not.toBe(loginBody.data.refreshToken)

    const reusedRes = await request('/auth/refresh', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken: loginBody.data.refreshToken }),
    })
    expect(reusedRes.status).toBe(401)

    const logoutRes = await request('/auth/logout', {
      method: 'POST',
      headers: { authorization: `Bearer ${refreshBody.data.accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken: refreshBody.data.refreshToken }),
    })
    expect(logoutRes.status).toBe(200)

    const afterLogoutRes = await request('/auth/refresh', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken: refreshBody.data.refreshToken }),
    })
    expect(afterLogoutRes.status).toBe(401)
  })

  test('sends reset code and resets password', async () => {
    await registerUser('reset@example.com')
    const forgotRes = await request('/auth/forgot-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'reset@example.com' }),
    })
    expect(forgotRes.status).toBe(200)
    expect(testEmailOutbox).toHaveLength(1)

    const resetRes = await request('/auth/reset-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'reset@example.com', code: testEmailOutbox[0].code, newPassword: 'newpassword123' }),
    })
    expect(resetRes.status).toBe(200)

    const loginRes = await request('/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'reset@example.com', password: 'newpassword123' }),
    })
    expect(loginRes.status).toBe(200)
  })
})
