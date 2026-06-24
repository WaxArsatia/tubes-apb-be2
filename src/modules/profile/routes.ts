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
const imageTypes = ['image/jpeg', 'image/png'] as const
type ProfilePhotoType = (typeof imageTypes)[number]

function isJpeg(bytes: Uint8Array) {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
}

function isPng(bytes: Uint8Array) {
  return (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  )
}

async function resolveProfilePhotoType(photo: File): Promise<ProfilePhotoType | null> {
  if (imageTypes.includes(photo.type as ProfilePhotoType)) return photo.type as ProfilePhotoType
  if (photo.type && photo.type !== 'application/octet-stream') return null

  const bytes = new Uint8Array(await photo.slice(0, 8).arrayBuffer())
  if (isJpeg(bytes)) return 'image/jpeg'
  if (isPng(bytes)) return 'image/png'
  return null
}

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
  if (photo.size > 5 * 1024 * 1024) throw new AppError('VALIDATION_ERROR', 'Photo must be at most 5 MB', 400)
  const photoType = await resolveProfilePhotoType(photo)
  if (!photoType) throw new AppError('VALIDATION_ERROR', 'Photo must be JPEG or PNG', 400)

  const ext = photoType === 'image/png' ? 'png' : 'jpg'
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
