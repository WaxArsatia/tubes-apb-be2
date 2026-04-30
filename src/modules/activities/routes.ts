import { Hono } from 'hono'
import { z } from 'zod'
import type { AppEnv } from '../../app'
import { sql } from '../../db/client'
import { ok } from '../../http/envelope'
import { queryParams } from '../../http/validation'
import { requireAuth } from '../auth/middleware'

export const activityRoutes = new Hono<AppEnv>()
activityRoutes.use('*', requireAuth)

activityRoutes.get('/recent', async (c) => {
  const { limit } = queryParams(c, z.object({ limit: z.coerce.number().int().positive().max(50).default(5) }))
  const rows = await sql<any[]>`
    select t.id, 'transaction' as kind, t.name, t.amount, c.name as category_name, c.icon_key, t.date::text, t.created_at
    from transactions t
    left join categories c on c.id = t.category_id
    where t.user_id = ${c.get('userId')} and t.deleted_at is null
    union all
    select s.id, 'saving' as kind, s.name, s.amount, c.name as category_name, c.icon_key, s.date::text, s.created_at
    from savings s
    left join categories c on c.id = s.category_id
    where s.user_id = ${c.get('userId')} and s.deleted_at is null
    order by created_at desc
    limit ${limit}
  `
  return ok(c, rows.map((row: any) => ({
    id: row.id,
    kind: row.kind,
    name: row.name,
    amount: row.amount,
    categoryName: row.category_name,
    iconKey: row.icon_key,
    date: row.date,
    createdAt: new Date(row.created_at).toISOString(),
  })), 'Recent activities retrieved successfully')
})
