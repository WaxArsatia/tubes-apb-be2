import { Hono } from 'hono'
import { z } from 'zod'
import type { AppEnv } from '../../app'
import { sql } from '../../db/client'
import { ok, type Warning } from '../../http/envelope'
import { AppError } from '../../http/errors'
import { dateOnlySchema, jsonBody, moneySchema, monthSchema, paginationSchema, queryParams, uuidSchema } from '../../http/validation'
import { restoreExpiresAt, iso, isExpired } from '../../utils/time'
import { requireAuth } from '../auth/middleware'
import { categoryDto, getActiveCategory, type CategoryRow } from '../categories/service'

type TxRow = {
  id: string
  user_id: string
  name: string
  amount: number
  category_id: string | null
  date: string
  note: string | null
  deleted_at: Date | null
  restore_expires_at: Date | null
  created_at: Date
  updated_at: Date
}

const createSchema = z.object({
  name: z.string().trim().max(160).optional().default(''),
  amount: moneySchema,
  categoryId: uuidSchema,
  date: dateOnlySchema,
  note: z.string().max(1000).nullish(),
})
const updateSchema = createSchema.partial().extend({ categoryId: uuidSchema.optional() })

function txDto(row: TxRow, category?: CategoryRow | null) {
  return {
    id: row.id,
    name: row.name,
    amount: row.amount,
    categoryId: row.category_id,
    category: categoryDto(category ?? null),
    date: row.date,
    note: row.note,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  }
}

async function getTx(userId: string, id: string, includeDeleted = false) {
  const rows = await sql<TxRow[]>`
    select * from transactions where id = ${id} and user_id = ${userId}
      ${includeDeleted ? sql`` : sql`and deleted_at is null`}
    limit 1
  `
  return rows[0] ?? null
}

async function budgetWarning(userId: string, categoryId: string, date: string, newAmount: number, excludeId?: string): Promise<Warning[]> {
  const category = await getActiveCategory(userId, categoryId, 'expense')
  if (!category?.monthly_budget) return []
  const month = date.slice(0, 7)
  const rows = await sql<{ total: number | null }[]>`
    select coalesce(sum(amount), 0)::int as total from transactions
    where user_id = ${userId} and category_id = ${categoryId} and deleted_at is null
      and to_char(date, 'YYYY-MM') = ${month}
      ${excludeId ? sql`and id <> ${excludeId}` : sql``}
  `
  const current = rows[0]?.total ?? 0
  if (current + newAmount <= category.monthly_budget) return []
  return [{
    code: 'BUDGET_EXCEEDED',
    message: 'Transaction exceeds the category monthly budget',
    details: { categoryId, monthlyBudget: category.monthly_budget, currentMonthSpending: current, newTransactionAmount: newAmount },
  }]
}

async function withCategory(row: TxRow) {
  const categories = row.category_id
    ? await sql<CategoryRow[]>`select * from categories where id = ${row.category_id} limit 1`
    : []
  return txDto(row, categories[0] ?? null)
}

export const transactionRoutes = new Hono<AppEnv>()
transactionRoutes.use('*', requireAuth)

transactionRoutes.get('/', async (c) => {
  const q = queryParams(c, paginationSchema.extend({ month: monthSchema, categoryId: uuidSchema.optional() }))
  const offset = (q.page - 1) * q.limit
  const rows = await sql<TxRow[]>`
    select * from transactions
    where user_id = ${c.get('userId')} and deleted_at is null
      ${q.month ? sql`and to_char(date, 'YYYY-MM') = ${q.month}` : sql``}
      ${q.categoryId ? sql`and category_id = ${q.categoryId}` : sql``}
    order by date desc, created_at desc
    limit ${q.limit} offset ${offset}
  `
  const totals = await sql<{ total: number }[]>`
    select count(*)::int as total from transactions
    where user_id = ${c.get('userId')} and deleted_at is null
      ${q.month ? sql`and to_char(date, 'YYYY-MM') = ${q.month}` : sql``}
      ${q.categoryId ? sql`and category_id = ${q.categoryId}` : sql``}
  `
  return ok(c, await Promise.all(rows.map(withCategory)), 'Transactions retrieved successfully', { page: q.page, limit: q.limit, total: totals[0]?.total ?? 0 })
})

transactionRoutes.post('/', async (c) => {
  const input = await jsonBody(c, createSchema)
  const category = await getActiveCategory(c.get('userId'), input.categoryId, 'expense')
  if (!category) throw new AppError('UNPROCESSABLE_ENTITY', 'categoryId must refer to an expense category', 422)
  const name = input.name.trim() || category.name
  const warnings = await budgetWarning(c.get('userId'), input.categoryId, input.date, input.amount)
  const rows = await sql<TxRow[]>`
    insert into transactions (user_id, name, amount, category_id, date, note)
    values (${c.get('userId')}, ${name}, ${input.amount}, ${input.categoryId}, ${input.date}, ${input.note ?? null})
    returning *
  `
  return ok(c, txDto(rows[0], category), 'Transaction created successfully', undefined, warnings, 201)
})

transactionRoutes.get('/:id', async (c) => {
  const row = await getTx(c.get('userId'), uuidSchema.parse(c.req.param('id')))
  if (!row) throw new AppError('NOT_FOUND', 'Transaction not found', 404)
  return ok(c, await withCategory(row), 'Transaction retrieved successfully')
})

transactionRoutes.patch('/:id', async (c) => {
  const id = uuidSchema.parse(c.req.param('id'))
  const current = await getTx(c.get('userId'), id)
  if (!current) throw new AppError('NOT_FOUND', 'Transaction not found', 404)
  const input = await jsonBody(c, updateSchema)
  const categoryId = input.categoryId ?? current.category_id
  if (!categoryId) throw new AppError('VALIDATION_ERROR', 'categoryId is required', 400)
  const category = await getActiveCategory(c.get('userId'), categoryId, 'expense')
  if (!category) throw new AppError('UNPROCESSABLE_ENTITY', 'categoryId must refer to an expense category', 422)
  const amount = input.amount ?? current.amount
  const date = input.date ?? current.date
  const name = input.name !== undefined ? (input.name.trim() || category.name) : current.name
  const warnings = await budgetWarning(c.get('userId'), categoryId, date, amount, id)
  const rows = await sql<TxRow[]>`
    update transactions set name = ${name}, amount = ${amount}, category_id = ${categoryId}, date = ${date}, note = ${input.note ?? current.note}, updated_at = now()
    where id = ${id} and user_id = ${c.get('userId')}
    returning *
  `
  return ok(c, txDto(rows[0], category), 'Transaction updated successfully', undefined, warnings)
})

transactionRoutes.delete('/:id', async (c) => {
  const id = uuidSchema.parse(c.req.param('id'))
  const current = await getTx(c.get('userId'), id)
  if (!current) throw new AppError('NOT_FOUND', 'Transaction not found', 404)
  await sql`update transactions set deleted_at = now(), restore_expires_at = ${restoreExpiresAt()}, updated_at = now() where id = ${id}`
  return ok(c, { success: true }, 'Transaction deleted successfully')
})

transactionRoutes.post('/:id/restore', async (c) => {
  const id = uuidSchema.parse(c.req.param('id'))
  const current = await getTx(c.get('userId'), id, true)
  if (!current) throw new AppError('NOT_FOUND', 'Transaction not found', 404)
  if (current.deleted_at && isExpired(current.restore_expires_at)) throw new AppError('UNPROCESSABLE_ENTITY', 'Transaction restore window has expired', 422)
  const rows = await sql<TxRow[]>`update transactions set deleted_at = null, restore_expires_at = null, updated_at = now() where id = ${id} returning *`
  return ok(c, await withCategory(rows[0]), 'Transaction restored successfully')
})
