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
    expect(list.data[0].categoryId).toBe(category.data.id)
    expect(list.data[0].category).toMatchObject({
      id: category.data.id,
      name: 'Transport',
      type: 'expense',
    })
  })

  test('stores optional transaction location and allows clearing it', async () => {
    const { accessToken } = await registerUser('tx-location@example.com')
    await createSavingIncome(accessToken)
    const category = await createCategory(accessToken, {
      type: 'expense',
      name: 'Food',
      iconKey: 'food',
      monthlyBudget: 100_000,
    })

    const createRes = await request('/transactions', {
      method: 'POST',
      headers: authHeaders(accessToken, { 'content-type': 'application/json' }),
      body: JSON.stringify({
        name: 'Lunch',
        amount: 35_000,
        categoryId: category.data.id,
        date: '2026-04-10',
        location: { latitude: -6.2, longitude: 106.816666, source: 'gps' },
      }),
    })
    const created = await json(createRes)
    expect(createRes.status).toBe(201)
    expect(created.data.location).toEqual({
      latitude: -6.2,
      longitude: 106.816666,
      source: 'gps',
    })

    const updateRes = await request(`/transactions/${created.data.id}`, {
      method: 'PATCH',
      headers: authHeaders(accessToken, { 'content-type': 'application/json' }),
      body: JSON.stringify({
        location: { latitude: -6.175392, longitude: 106.827153, source: 'manual' },
      }),
    })
    const updated = await json(updateRes)
    expect(updateRes.status).toBe(200)
    expect(updated.data.location).toEqual({
      latitude: -6.175392,
      longitude: 106.827153,
      source: 'manual',
    })

    const clearRes = await request(`/transactions/${created.data.id}`, {
      method: 'PATCH',
      headers: authHeaders(accessToken, { 'content-type': 'application/json' }),
      body: JSON.stringify({ location: null }),
    })
    const cleared = await json(clearRes)
    expect(clearRes.status).toBe(200)
    expect(cleared.data.location).toBeNull()
  })

  test('clears nullable category fields and finance notes with explicit null', async () => {
    const { accessToken } = await registerUser('nullable-patch@example.com')
    await createSavingIncome(accessToken)

    const expenseCategory = await createCategory(accessToken, {
      type: 'expense',
      name: 'Groceries',
      iconKey: 'cart',
      monthlyBudget: 250_000,
    })
    const clearExpense = await request(`/categories/${expenseCategory.data.id}`, {
      method: 'PATCH',
      headers: authHeaders(accessToken, { 'content-type': 'application/json' }),
      body: JSON.stringify({ monthlyBudget: null }),
    })
    const clearedExpense = await json(clearExpense)
    expect(clearExpense.status).toBe(200)
    expect(clearedExpense.data.monthlyBudget).toBeNull()
    const fetchedExpense = await json(await request(`/categories/${expenseCategory.data.id}`, { headers: authHeaders(accessToken) }))
    expect(fetchedExpense.data.monthlyBudget).toBeNull()

    const savingCategory = await createCategory(accessToken, {
      type: 'saving',
      name: 'House',
      iconKey: 'home',
      savingTarget: 5_000_000,
    })
    const clearSavingCategory = await request(`/categories/${savingCategory.data.id}`, {
      method: 'PATCH',
      headers: authHeaders(accessToken, { 'content-type': 'application/json' }),
      body: JSON.stringify({ savingTarget: null }),
    })
    const clearedSavingCategory = await json(clearSavingCategory)
    expect(clearSavingCategory.status).toBe(200)
    expect(clearedSavingCategory.data.savingTarget).toBeNull()
    const fetchedSavingCategory = await json(await request(`/categories/${savingCategory.data.id}`, { headers: authHeaders(accessToken) }))
    expect(fetchedSavingCategory.data.savingTarget).toBeNull()

    const txRes = await request('/transactions', {
      method: 'POST',
      headers: authHeaders(accessToken, { 'content-type': 'application/json' }),
      body: JSON.stringify({
        name: 'Groceries',
        amount: 75_000,
        categoryId: expenseCategory.data.id,
        date: '2026-04-12',
        note: 'with note',
      }),
    })
    const tx = await json(txRes)
    const clearTxNote = await request(`/transactions/${tx.data.id}`, {
      method: 'PATCH',
      headers: authHeaders(accessToken, { 'content-type': 'application/json' }),
      body: JSON.stringify({ note: null }),
    })
    const clearedTxNote = await json(clearTxNote)
    expect(clearTxNote.status).toBe(200)
    expect(clearedTxNote.data.note).toBeNull()
    const fetchedTx = await json(await request(`/transactions/${tx.data.id}`, { headers: authHeaders(accessToken) }))
    expect(fetchedTx.data.note).toBeNull()

    const savingRes = await request('/savings', {
      method: 'POST',
      headers: authHeaders(accessToken, { 'content-type': 'application/json' }),
      body: JSON.stringify({
        type: 'saving',
        name: 'House',
        amount: 100_000,
        categoryId: savingCategory.data.id,
        date: '2026-04-13',
        note: 'with note',
      }),
    })
    const saving = await json(savingRes)
    const clearSavingNote = await request(`/savings/${saving.data.id}`, {
      method: 'PATCH',
      headers: authHeaders(accessToken, { 'content-type': 'application/json' }),
      body: JSON.stringify({ note: null }),
    })
    const clearedSavingNote = await json(clearSavingNote)
    expect(clearSavingNote.status).toBe(200)
    expect(clearedSavingNote.data.note).toBeNull()
    const fetchedSaving = await json(await request(`/savings/${saving.data.id}`, { headers: authHeaders(accessToken) }))
    expect(fetchedSaving.data.note).toBeNull()
  })

  test('rejects invalid transaction coordinates', async () => {
    const { accessToken } = await registerUser('tx-location-invalid@example.com')
    await createSavingIncome(accessToken)
    const category = await createCategory(accessToken, {
      type: 'expense',
      name: 'Transport',
      iconKey: 'bus',
      monthlyBudget: 100_000,
    })

    const res = await request('/transactions', {
      method: 'POST',
      headers: authHeaders(accessToken, { 'content-type': 'application/json' }),
      body: JSON.stringify({
        name: 'Taxi',
        amount: 50_000,
        categoryId: category.data.id,
        date: '2026-04-11',
        location: { latitude: -91, longitude: 106.8, source: 'gps' },
      }),
    })
    const body = await json(res)
    expect(res.status).toBe(400)
    expect(body.error.code).toBe('VALIDATION_ERROR')
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
    expect(list.data[0].categoryId).toBe(category.data.id)
    expect(list.data[0].category).toMatchObject({
      id: category.data.id,
      name: 'Emergency',
      type: 'saving',
    })

    expect((await request(`/savings/${savingBody.data.id}`, { method: 'DELETE', headers: authHeaders(accessToken) })).status).toBe(200)
    expect((await request(`/savings/${savingBody.data.id}/restore`, { method: 'POST', headers: authHeaders(accessToken) })).status).toBe(200)
  })
})
