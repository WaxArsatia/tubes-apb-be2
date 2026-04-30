import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import { authHeaders, closeDatabase, createCategory, createSavingIncome, json, prepareDatabase, registerUser, request } from '../helpers/app'

beforeEach(prepareDatabase)
afterAll(closeDatabase)

describe('categories and finance integration', () => {
  test('enforces category uniqueness and relinks records on restore', async () => {
    const { accessToken } = await registerUser('category@example.com')
    await createSavingIncome(accessToken)
    const categoryBody = await createCategory(accessToken, {
      type: 'expense',
      name: 'Food',
      iconKey: 'food',
      monthlyBudget: 100_000,
    })
    const duplicateRes = await request('/categories', {
      method: 'POST',
      headers: authHeaders(accessToken, { 'content-type': 'application/json' }),
      body: JSON.stringify({ type: 'expense', name: 'food', iconKey: 'food' }),
    })
    expect(duplicateRes.status).toBe(409)

    const txRes = await request('/transactions', {
      method: 'POST',
      headers: authHeaders(accessToken, { 'content-type': 'application/json' }),
      body: JSON.stringify({ amount: 25_000, categoryId: categoryBody.data.id, date: '2026-04-10' }),
    })
    const txBody = await json(txRes)
    expect(txBody.data.name).toBe('Food')

    expect((await request(`/categories/${categoryBody.data.id}`, { method: 'DELETE', headers: authHeaders(accessToken) })).status).toBe(200)
    const unlinked = await json(await request(`/transactions/${txBody.data.id}`, { headers: authHeaders(accessToken) }))
    expect(unlinked.data.categoryId).toBeNull()

    const restored = await request(`/categories/${categoryBody.data.id}/restore`, { method: 'POST', headers: authHeaders(accessToken) })
    expect(restored.status).toBe(200)
    const relinked = await json(await request(`/transactions/${txBody.data.id}`, { headers: authHeaders(accessToken) }))
    expect(relinked.data.categoryId).toBe(categoryBody.data.id)
  })

  test('filters transactions and returns budget warning without blocking save', async () => {
    const { accessToken } = await registerUser('tx@example.com')
    await createSavingIncome(accessToken)
    const category = await createCategory(accessToken, {
      type: 'expense',
      name: 'Transport',
      iconKey: 'bus',
      monthlyBudget: 50_000,
    })
    const firstRes = await request('/transactions', {
      method: 'POST',
      headers: authHeaders(accessToken, { 'content-type': 'application/json' }),
      body: JSON.stringify({ name: 'Bus', amount: 40_000, categoryId: category.data.id, date: '2026-04-03' }),
    })
    expect(firstRes.status).toBe(201)

    const warningRes = await request('/transactions', {
      method: 'POST',
      headers: authHeaders(accessToken, { 'content-type': 'application/json' }),
      body: JSON.stringify({ name: 'Taxi', amount: 20_000, categoryId: category.data.id, date: '2026-04-05' }),
    })
    const warningBody = await json(warningRes)
    expect(warningRes.status).toBe(201)
    expect(warningBody.warnings[0].code).toBe('BUDGET_EXCEEDED')

    const list = await json(await request(`/transactions?month=2026-04&categoryId=${category.data.id}`, { headers: authHeaders(accessToken) }))
    expect(list.meta.total).toBe(2)
  })

  test('validates saving category rules and returns target warning', async () => {
    const { accessToken } = await registerUser('saving@example.com')
    const generalIncome = await request('/savings', {
      method: 'POST',
      headers: authHeaders(accessToken, { 'content-type': 'application/json' }),
      body: JSON.stringify({ type: 'general_income', amount: 1_000_000, categoryId: crypto.randomUUID(), date: '2026-04-01' }),
    })
    expect(generalIncome.status).toBe(400)

    const category = await createCategory(accessToken, {
      type: 'saving',
      name: 'Emergency',
      iconKey: 'safe',
      savingTarget: 100_000,
    })
    const savingRes = await request('/savings', {
      method: 'POST',
      headers: authHeaders(accessToken, { 'content-type': 'application/json' }),
      body: JSON.stringify({ type: 'saving', amount: 150_000, categoryId: category.data.id, date: '2026-04-02' }),
    })
    const savingBody = await json(savingRes)
    expect(savingRes.status).toBe(201)
    expect(savingBody.data.name).toBe('Emergency')
    expect(savingBody.warnings[0].code).toBe('SAVING_TARGET_EXCEEDED')

    const list = await json(await request(`/savings?type=saving&month=2026-04&categoryId=${category.data.id}`, { headers: authHeaders(accessToken) }))
    expect(list.meta.total).toBe(1)

    expect((await request(`/savings/${savingBody.data.id}`, { method: 'DELETE', headers: authHeaders(accessToken) })).status).toBe(200)
    expect((await request(`/savings/${savingBody.data.id}/restore`, { method: 'POST', headers: authHeaders(accessToken) })).status).toBe(200)
  })
})
