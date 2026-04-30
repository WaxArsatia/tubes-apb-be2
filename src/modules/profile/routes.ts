import { Hono } from 'hono'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import type { AppEnv } from '../../app'
import { sql } from '../../db/client'
import { ok } from '../../http/envelope'
import { AppError } from '../../http/errors'
import { jsonBody } from '../../http/validation'
import { requireAuth } from '../auth/middleware'
import { findUserById, userDto } from '../auth/service'

const profileSchema = z.object({ name: z.string().trim().min(1).max(120) })
const notificationsSchema = z.object({ budgetNotificationEnabled: z.boolean() })

export const profileRoutes = new Hono<AppEnv>()
profileRoutes.use('*', requireAuth)

profileRoutes.get('/', async (c) => {
  if (new URL(c.req.url).pathname !== '/profile') return c.notFound()
  const user = await findUserById(c.get('userId'))
  if (!user) throw new AppError('NOT_FOUND', 'Profile not found', 404)
  return ok(c, userDto(user), 'Profile retrieved successfully')
})

profileRoutes.patch('/', async (c) => {
  if (new URL(c.req.url).pathname !== '/profile') return c.notFound()
  const input = await jsonBody(c, profileSchema)
  const rows = await sql<any[]>`update users set name = ${input.name}, updated_at = now() where id = ${c.get('userId')} returning *`
  return ok(c, userDto(rows[0]), 'Profile updated successfully')
})

profileRoutes.post('/photo', async (c) => {
  const body = await c.req.parseBody()
  const photo = body.photo
  if (!(photo instanceof File)) throw new AppError('VALIDATION_ERROR', 'Photo file is required', 400)
  if (!['image/jpeg', 'image/png'].includes(photo.type)) throw new AppError('VALIDATION_ERROR', 'Photo must be JPEG or PNG', 400)
  if (photo.size > 5 * 1024 * 1024) throw new AppError('VALIDATION_ERROR', 'Photo must be at most 5 MB', 400)

  const ext = photo.type === 'image/png' ? 'png' : 'jpg'
  const fileName = `${c.get('userId')}-${Date.now()}.${ext}`
  const config = c.get('config')
  const relativeDir = join(config.uploadDir, 'profile-photos')
  await mkdir(relativeDir, { recursive: true })
  await Bun.write(join(relativeDir, fileName), photo)

  const url = `/uploads/profile-photos/${fileName}`
  const rows = await sql<any[]>`update users set profile_photo_url = ${url}, updated_at = now() where id = ${c.get('userId')} returning *`
  return ok(c, userDto(rows[0]), 'Profile photo uploaded successfully')
})

profileRoutes.patch('/notifications', async (c) => {
  if (new URL(c.req.url).pathname !== '/settings/notifications') return c.notFound()
  const input = await jsonBody(c, notificationsSchema)
  const rows = await sql<any[]>`
    update users
    set budget_notification_enabled = ${input.budgetNotificationEnabled}, updated_at = now()
    where id = ${c.get('userId')}
    returning *
  `
  return ok(c, userDto(rows[0]), 'Notification settings updated successfully')
})
