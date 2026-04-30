import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import { authHeaders, closeDatabase, createCategory, createSavingIncome, json, prepareDatabase, registerUser, request } from '../helpers/app'

beforeEach(prepareDatabase)
afterAll(closeDatabase)

describe('profile, settings, uploads, and activities', () => {
  test('updates profile and notification settings', async () => {
    const { accessToken } = await registerUser('profile@example.com')
    const profileRes = await request('/profile', {
      method: 'PATCH',
      headers: authHeaders(accessToken, { 'content-type': 'application/json' }),
      body: JSON.stringify({ name: 'Bima' }),
    })
    const profileBody = await json(profileRes)
    expect(profileRes.status).toBe(200)
    expect(profileBody.data.name).toBe('Bima')

    const settingsRes = await request('/settings/notifications', {
      method: 'PATCH',
      headers: authHeaders(accessToken, { 'content-type': 'application/json' }),
      body: JSON.stringify({ budgetNotificationEnabled: false }),
    })
    const settingsBody = await json(settingsRes)
    expect(settingsRes.status).toBe(200)
    expect(settingsBody.data.budgetNotificationEnabled).toBe(false)
  })

  test('validates profile photo uploads', async () => {
    const { accessToken } = await registerUser('photo@example.com')
    const bad = new FormData()
    bad.set('photo', new File(['not image'], 'bad.txt', { type: 'text/plain' }))
    const badRes = await request('/profile/photo', { method: 'POST', headers: authHeaders(accessToken), body: bad })
    expect(badRes.status).toBe(400)

    const good = new FormData()
    good.set('photo', new File([new Uint8Array([137, 80, 78, 71])], 'photo.png', { type: 'image/png' }))
    const goodRes = await request('/profile/photo', { method: 'POST', headers: authHeaders(accessToken), body: good })
    const goodBody = await json(goodRes)
    expect(goodRes.status).toBe(200)
    expect(goodBody.data.profilePhotoUrl).toContain('/uploads/profile-photos/')
  })

  test('returns recent activities newest first', async () => {
    const { accessToken } = await registerUser('activity@example.com')
    await createSavingIncome(accessToken)
    const expense = await createCategory(accessToken, { type: 'expense', name: 'Food', iconKey: 'food' })
    const saving = await createCategory(accessToken, { type: 'saving', name: 'Trip', iconKey: 'plane', savingTarget: 1_000_000 })

    await request('/transactions', {
      method: 'POST',
      headers: authHeaders(accessToken, { 'content-type': 'application/json' }),
      body: JSON.stringify({ name: 'Lunch', amount: 20_000, categoryId: expense.data.id, date: '2026-04-10' }),
    })
    await new Promise((resolve) => setTimeout(resolve, 10))
    await request('/savings', {
      method: 'POST',
      headers: authHeaders(accessToken, { 'content-type': 'application/json' }),
      body: JSON.stringify({ type: 'saving', name: 'Ticket', amount: 50_000, categoryId: saving.data.id, date: '2026-04-11' }),
    })

    const activities = await json(await request('/activities/recent?limit=5', { headers: authHeaders(accessToken) }))
    expect(activities.data).toHaveLength(3)
    expect(activities.data[0].kind).toBe('saving')
    expect(activities.data[0].name).toBe('Ticket')
  })
})
