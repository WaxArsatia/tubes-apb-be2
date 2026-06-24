import { Hono } from 'hono'
import { z } from 'zod'
import type { AppEnv } from '../../app'
import { sql } from '../../db/client'
import { ok, type Warning } from '../../http/envelope'
import { AppError } from '../../http/errors'
import { dateOnlySchema, jsonBody, moneySchema, monthSchema, paginationSchema, queryParams, uuidSchema } from '../../http/validation'
import { iso, isExpired, restoreExpiresAt } from '../../utils/time'
import { requireAuth } from '../auth/middleware'
import { categoryDto, getActiveCategory, type CategoryRow } from '../categories/service'

type SavingRow = {
  id: string
  user_id: string
  type: 'general_income' | 'saving'
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

const savingType = z.enum(['general_income', 'saving'])
const createSchema = z.object({
  type: savingType,
  name: z.string().trim().max(160).optional().default(''),
  amount: moneySchema,
  categoryId: uuidSchema.nullish(),
  date: dateOnlySchema,
  note: z.string().max(1000).nullish(),
})
const updateSchema = createSchema.partial()

function savingDto(row: SavingRow, category?: CategoryRow | null) {
  return {
    id: row.id,
    type: row.type,
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

async function getSaving(userId: string, id: string, includeDeleted = false) {
  const rows = await sql<SavingRow[]>`
    select * from savings where id = ${id} and user_id = ${userId}
      ${includeDeleted ? sql`` : sql`and deleted_at is null`}
    limit 1
  `
  return rows[0] ?? null
}

async function validateSavingCategory(userId: string, type: 'general_income' | 'saving', categoryId?: string | null) {
  if (type === 'general_income') {
    if (categoryId) throw new AppError('VALIDATION_ERROR', 'categoryId must be omitted for general_income', 400)
    return null
  }
  if (!categoryId) throw new AppError('VALIDATION_ERROR', 'categoryId is required for saving entries', 400)
  const category = await getActiveCategory(userId, categoryId, 'saving')
  if (!category) throw new AppError('UNPROCESSABLE_ENTITY', 'categoryId must refer to a saving category', 422)
  return category
}

async function targetWarning(userId: string, category: CategoryRow | null, newAmount: number, excludeId?: string): Promise<Warning[]> {
  if (!category?.saving_target) return []
  const rows = await sql<{ total: number | null }[]>`
    select coalesce(sum(amount), 0)::int as total from savings
    where user_id = ${userId} and category_id = ${category.id} and type = 'saving' and deleted_at is null
      ${excludeId ? sql`and id <> ${excludeId}` : sql``}
  `
  const current = rows[0]?.total ?? 0
  if (current + newAmount <= category.saving_target) return []
  return [{
    code: 'SAVING_TARGET_EXCEEDED',
    message: 'Saving target has been exceeded',
    details: { categoryId: category.id, savingTarget: category.saving_target, currentSavedAmount: current, newSavingAmount: newAmount },
  }]
}

async function withCategory(row: SavingRow) {
  const categories = row.category_id ? await sql<CategoryRow[]>`select * from categories where id = ${row.category_id} limit 1` : []
  return savingDto(row, categories[0] ?? null)
}

async function withBatchedCategories(rows: SavingRow[]) {
  const categoryIds = [...new Set(rows.map((row) => row.category_id).filter((id): id is string => id !== null))]
  const categories = categoryIds.length
    ? await sql<CategoryRow[]>`select * from categories where id in ${sql(categoryIds)}`
    : []
  const categoryById = new Map(categories.map((category) => [category.id, category]))
  return rows.map((row) => savingDto(row, row.category_id ? categoryById.get(row.category_id) ?? null : null))
}

export const savingRoutes = new Hono<AppEnv>()
savingRoutes.use('*', requireAuth)

savingRoutes.get('/', async (c) => {
  const q = queryParams(c, paginationSchema.extend({ type: savingType.optional(), month: monthSchema, categoryId: uuidSchema.optional() }))
  const offset = (q.page - 1) * q.limit
  const rows = await sql<SavingRow[]>`
    select * from savings
    where user_id = ${c.get('userId')} and deleted_at is null
      ${q.type ? sql`and type = ${q.type}` : sql``}
      ${q.month ? sql`and to_char(date, 'YYYY-MM') = ${q.month}` : sql``}
      ${q.categoryId ? sql`and category_id = ${q.categoryId}` : sql``}
    order by date desc, created_at desc
    limit ${q.limit} offset ${offset}
  `
  const totals = await sql<{ total: number }[]>`
    select count(*)::int as total from savings
    where user_id = ${c.get('userId')} and deleted_at is null
      ${q.type ? sql`and type = ${q.type}` : sql``}
      ${q.month ? sql`and to_char(date, 'YYYY-MM') = ${q.month}` : sql``}
      ${q.categoryId ? sql`and category_id = ${q.categoryId}` : sql``}
  `
  return ok(c, await withBatchedCategories(rows), 'Savings retrieved successfully', { page: q.page, limit: q.limit, total: totals[0]?.total ?? 0 })
})

savingRoutes.post('/', async (c) => {
  const input = await jsonBody(c, createSchema)
  const category = await validateSavingCategory(c.get('userId'), input.type, input.categoryId)
  const name = input.name.trim() || (input.type === 'general_income' ? 'Pemasukan Umum' : category!.name)
  const warnings = await targetWarning(c.get('userId'), category, input.amount)
  const insertCategoryId = input.type === 'saving' ? input.categoryId! : null
  const rows = await sql<SavingRow[]>`
    insert into savings (user_id, type, name, amount, category_id, date, note)
    values (${c.get('userId')}, ${input.type}, ${name}, ${input.amount}, ${insertCategoryId}, ${input.date}, ${input.note ?? null})
    returning *
  `
  return ok(c, savingDto(rows[0], category), 'Saving created successfully', undefined, warnings, 201)
})

savingRoutes.get('/:id', async (c) => {
  const row = await getSaving(c.get('userId'), uuidSchema.parse(c.req.param('id')))
  if (!row) throw new AppError('NOT_FOUND', 'Saving not found', 404)
  return ok(c, await withCategory(row), 'Saving retrieved successfully')
})

savingRoutes.patch('/:id', async (c) => {
  const id = uuidSchema.parse(c.req.param('id'))
  const current = await getSaving(c.get('userId'), id)
  if (!current) throw new AppError('NOT_FOUND', 'Saving not found', 404)
  const input = await jsonBody(c, updateSchema)
  const type = input.type ?? current.type
  const categoryId = input.categoryId !== undefined ? input.categoryId : current.category_id
  const category = await validateSavingCategory(c.get('userId'), type, categoryId)
  const amount = input.amount ?? current.amount
  const date = input.date ?? current.date
  const name = input.name !== undefined ? (input.name.trim() || (type === 'general_income' ? 'Pemasukan Umum' : category!.name)) : current.name
  const note = Object.prototype.hasOwnProperty.call(input, 'note') ? input.note ?? null : current.note
  const warnings = await targetWarning(c.get('userId'), category, amount, id)
  const rows = await sql<SavingRow[]>`
    update savings set type = ${type}, name = ${name}, amount = ${amount}, category_id = ${type === 'saving' ? categoryId : null}, date = ${date}, note = ${note}, updated_at = now()
    where id = ${id} and user_id = ${c.get('userId')}
    returning *
  `
  return ok(c, savingDto(rows[0], category), 'Saving updated successfully', undefined, warnings)
})

savingRoutes.delete('/:id', async (c) => {
  const id = uuidSchema.parse(c.req.param('id'))
  const current = await getSaving(c.get('userId'), id)
  if (!current) throw new AppError('NOT_FOUND', 'Saving not found', 404)
  await sql`update savings set deleted_at = now(), restore_expires_at = ${restoreExpiresAt()}, updated_at = now() where id = ${id}`
  return ok(c, { success: true }, 'Saving deleted successfully')
})

savingRoutes.post('/:id/restore', async (c) => {
  const id = uuidSchema.parse(c.req.param('id'))
  const current = await getSaving(c.get('userId'), id, true)
  if (!current) throw new AppError('NOT_FOUND', 'Saving not found', 404)
  if (current.deleted_at && isExpired(current.restore_expires_at)) throw new AppError('UNPROCESSABLE_ENTITY', 'Saving restore window has expired', 422)
  const rows = await sql<SavingRow[]>`update savings set deleted_at = null, restore_expires_at = null, updated_at = now() where id = ${id} returning *`
  return ok(c, await withCategory(rows[0]), 'Saving restored successfully')
})
