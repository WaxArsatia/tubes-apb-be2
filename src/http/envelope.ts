import type { Context } from 'hono'

export type Warning = {
  code: string
  message: string
  details?: unknown
}

export function ok(c: Context, data: unknown, message = 'Success', meta?: unknown, warnings?: Warning[], status = 200) {
  const body: Record<string, unknown> = { data, message }
  if (meta) body.meta = meta
  if (warnings?.length) body.warnings = warnings
  return c.json(body, status as never)
}
