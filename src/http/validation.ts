import type { Context } from 'hono'
import { z } from 'zod'

export async function jsonBody<T extends z.ZodType>(c: Context, schema: T): Promise<z.infer<T>> {
  const body = await c.req.json().catch(() => ({}))
  return schema.parse(body)
}

export function queryParams<T extends z.ZodType>(c: Context, schema: T): z.infer<T> {
  return schema.parse(Object.fromEntries(new URL(c.req.url).searchParams.entries()))
}

export const uuidSchema = z.string().uuid()
export const moneySchema = z.number().int().positive()
export const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`)
  const today = new Date()
  const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))
  return date <= todayUtc
}, 'Date cannot be in the future')
export const monthSchema = z.string().regex(/^\d{4}-\d{2}$/).optional()
export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
})
