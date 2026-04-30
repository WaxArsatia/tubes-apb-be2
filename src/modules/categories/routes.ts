import { Hono } from 'hono'
import { z } from 'zod'
import type { AppEnv } from '../../app'
import { sql } from '../../db/client'
import { ok } from '../../http/envelope'
import { AppError } from '../../http/errors'
import { jsonBody, moneySchema, queryParams, uuidSchema } from '../../http/validation'
import { requireAuth } from '../auth/middleware'
import { assertCategoryRules, assertUniqueName, categoryDto, getActiveCategory, restoreCategory, softDeleteCategory, type CategoryRow } from './service'

const typeSchema = z.enum(['expense', 'saving'])
const createSchema = z.object({
  type: typeSchema,
  name: z.string().trim().min(1).max(120),
  iconKey: z.string().trim().min(1).max(80),
  monthlyBudget: moneySchema.nullish(),
  savingTarget: moneySchema.nullish(),
})
const updateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  iconKey: z.string().trim().min(1).max(80).optional(),
  monthlyBudget: moneySchema.nullish(),
  savingTarget: moneySchema.nullish(),
})

export const categoryRoutes = new Hono<AppEnv>()
categoryRoutes.use('*', requireAuth)

categoryRoutes.get('/', async (c) => {
  const query = queryParams(c, z.object({ type: typeSchema.optional() }))
  const rows = await sql<CategoryRow[]>`
    select * from categories
    where user_id = ${c.get('userId')} and deleted_at is null
      ${query.type ? sql`and type = ${query.type}` : sql``}
    order by lower(name) asc
  `
  return ok(c, rows.map(categoryDto), 'Categories retrieved successfully')
})

categoryRoutes.post('/', async (c) => {
  const input = await jsonBody(c, createSchema)
  const monthlyBudget = input.type === 'expense' ? input.monthlyBudget ?? null : null
  const savingTarget = input.type === 'saving' ? input.savingTarget ?? null : null
  await assertCategoryRules(c.get('userId'), input.type, monthlyBudget, savingTarget)
  await assertUniqueName(c.get('userId'), input.type, input.name)
  const rows = await sql<CategoryRow[]>`
    insert into categories (user_id, type, name, icon_key, monthly_budget, saving_target)
    values (${c.get('userId')}, ${input.type}, ${input.name}, ${input.iconKey}, ${monthlyBudget}, ${savingTarget})
    returning *
  `
  return ok(c, categoryDto(rows[0]), 'Category created successfully', undefined, undefined, 201)
})

categoryRoutes.get('/:id', async (c) => {
  const id = uuidSchema.parse(c.req.param('id'))
  const category = await getActiveCategory(c.get('userId'), id)
  if (!category) throw new AppError('NOT_FOUND', 'Category not found', 404)
  return ok(c, categoryDto(category), 'Category retrieved successfully')
})

categoryRoutes.patch('/:id', async (c) => {
  const id = uuidSchema.parse(c.req.param('id'))
  const category = await getActiveCategory(c.get('userId'), id)
  if (!category) throw new AppError('NOT_FOUND', 'Category not found', 404)
  const input = await jsonBody(c, updateSchema)
  const name = input.name ?? category.name
  const iconKey = input.iconKey ?? category.icon_key
  const monthlyBudget = category.type === 'expense' ? input.monthlyBudget ?? category.monthly_budget : null
  const savingTarget = category.type === 'saving' ? input.savingTarget ?? category.saving_target : null
  await assertCategoryRules(c.get('userId'), category.type, monthlyBudget, savingTarget)
  await assertUniqueName(c.get('userId'), category.type, name, id)
  const rows = await sql<CategoryRow[]>`
    update categories
    set name = ${name}, icon_key = ${iconKey}, monthly_budget = ${monthlyBudget}, saving_target = ${savingTarget}, updated_at = now()
    where id = ${id} and user_id = ${c.get('userId')}
    returning *
  `
  return ok(c, categoryDto(rows[0]), 'Category updated successfully')
})

categoryRoutes.delete('/:id', async (c) => {
  await softDeleteCategory(c.get('userId'), uuidSchema.parse(c.req.param('id')))
  return ok(c, { success: true }, 'Category deleted successfully')
})

categoryRoutes.post('/:id/restore', async (c) => {
  const category = await restoreCategory(c.get('userId'), uuidSchema.parse(c.req.param('id')))
  return ok(c, categoryDto(category), 'Category restored successfully')
})
