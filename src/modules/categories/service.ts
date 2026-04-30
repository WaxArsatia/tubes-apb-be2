import { sql } from '../../db/client'
import { AppError } from '../../http/errors'
import { iso, isExpired, restoreExpiresAt } from '../../utils/time'

export type CategoryRow = {
  id: string
  user_id: string
  type: 'expense' | 'saving'
  name: string
  icon_key: string
  monthly_budget: number | null
  saving_target: number | null
  deleted_at: Date | null
  restore_expires_at: Date | null
  created_at: Date
  updated_at: Date
}

export function categoryDto(row: CategoryRow | null) {
  if (!row) return null
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    iconKey: row.icon_key,
    monthlyBudget: row.monthly_budget,
    savingTarget: row.saving_target,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  }
}

export async function getActiveCategory(userId: string, id: string, type?: 'expense' | 'saving') {
  const rows = await sql<CategoryRow[]>`
    select * from categories
    where id = ${id} and user_id = ${userId} and deleted_at is null
      ${type ? sql`and type = ${type}` : sql``}
    limit 1
  `
  return rows[0] ?? null
}

export async function assertCategoryRules(userId: string, type: 'expense' | 'saving', monthlyBudget?: number | null, savingTarget?: number | null) {
  if (type === 'expense' && savingTarget != null) throw new AppError('VALIDATION_ERROR', 'savingTarget is only allowed for saving categories', 400)
  if (type === 'saving' && monthlyBudget != null) throw new AppError('VALIDATION_ERROR', 'monthlyBudget is only allowed for expense categories', 400)
  if (type === 'expense' && monthlyBudget != null) {
    const income = await sql<{ exists: boolean }[]>`select exists(select 1 from savings where user_id = ${userId} and type = 'general_income' and deleted_at is null) as exists`
    if (!income[0]?.exists) throw new AppError('UNPROCESSABLE_ENTITY', 'monthlyBudget requires at least one general income saving entry', 422)
  }
}

export async function assertUniqueName(userId: string, type: 'expense' | 'saving', name: string, exceptId?: string) {
  const rows = await sql<{ id: string }[]>`
    select id from categories
    where user_id = ${userId} and type = ${type} and lower(name) = lower(${name}) and deleted_at is null
      ${exceptId ? sql`and id <> ${exceptId}` : sql``}
    limit 1
  `
  if (rows[0]) throw new AppError('CONFLICT', 'Category name already exists for this type', 409)
}

export async function softDeleteCategory(userId: string, id: string) {
  const category = await getActiveCategory(userId, id)
  if (!category) throw new AppError('NOT_FOUND', 'Category not found', 404)
  const expires = restoreExpiresAt()

  await sql.begin(async (tx: any) => {
    await tx`delete from category_restore_links where category_id = ${id}`
    if (category.type === 'expense') {
      await tx`
        insert into category_restore_links (category_id, record_kind, record_id)
        select ${id}, 'transaction', id from transactions where user_id = ${userId} and category_id = ${id} and deleted_at is null
      `
      await tx`update transactions set category_id = null, updated_at = now() where user_id = ${userId} and category_id = ${id} and deleted_at is null`
    } else {
      await tx`
        insert into category_restore_links (category_id, record_kind, record_id)
        select ${id}, 'saving', id from savings where user_id = ${userId} and category_id = ${id} and deleted_at is null
      `
      await tx`update savings set category_id = null, updated_at = now() where user_id = ${userId} and category_id = ${id} and deleted_at is null`
    }
    await tx`update categories set deleted_at = now(), restore_expires_at = ${expires}, updated_at = now() where id = ${id}`
  })
}

export async function restoreCategory(userId: string, id: string) {
  const rows = await sql<CategoryRow[]>`select * from categories where id = ${id} and user_id = ${userId} limit 1`
  const category = rows[0]
  if (!category) throw new AppError('NOT_FOUND', 'Category not found', 404)
  if (!category.deleted_at) return category
  if (isExpired(category.restore_expires_at)) throw new AppError('UNPROCESSABLE_ENTITY', 'Category restore window has expired', 422)
  await assertUniqueName(userId, category.type, category.name, id)

  await sql.begin(async (tx: any) => {
    await tx`update categories set deleted_at = null, restore_expires_at = null, updated_at = now() where id = ${id}`
    if (category.type === 'expense') {
      await tx`
        update transactions set category_id = ${id}, updated_at = now()
        where id in (select record_id from category_restore_links where category_id = ${id} and record_kind = 'transaction')
          and user_id = ${userId} and deleted_at is null
      `
    } else {
      await tx`
        update savings set category_id = ${id}, updated_at = now()
        where id in (select record_id from category_restore_links where category_id = ${id} and record_kind = 'saving')
          and user_id = ${userId} and deleted_at is null
      `
    }
    await tx`delete from category_restore_links where category_id = ${id}`
  })
  return (await getActiveCategory(userId, id))!
}
