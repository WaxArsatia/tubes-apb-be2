import { Hono } from 'hono'
import { z } from 'zod'
import type { AppEnv } from '../../app'
import { sql } from '../../db/client'
import { AppError } from '../../http/errors'
import { ok } from '../../http/envelope'
import { jsonBody } from '../../http/validation'
import { sendPasswordResetCode } from '../../services/email'
import { createRefreshToken, findUserByEmail, hashValue, issueAuth, makeResetCode, revokeRefreshToken, signAccessToken, verifyHash, verifyStoredRefreshToken } from './service'
import { requireAuth } from './middleware'

const registerSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().email().toLowerCase(),
  password: z.string().min(8),
})
const loginSchema = z.object({ email: z.string().email().toLowerCase(), password: z.string().min(1) })
const refreshSchema = z.object({ refreshToken: z.string().min(1) })
const forgotSchema = z.object({ email: z.string().email().toLowerCase() })
const resetSchema = z.object({
  email: z.string().email().toLowerCase(),
  code: z.string().regex(/^[a-zA-Z0-9]{6}$/),
  newPassword: z.string().min(8),
})

export const authRoutes = new Hono<AppEnv>()

authRoutes.post('/register', async (c) => {
  const input = await jsonBody(c, registerSchema)
  if (await findUserByEmail(input.email)) throw new AppError('CONFLICT', 'Email is already registered', 409)

  const rows = await sql<any[]>`
    insert into users (name, email, password_hash)
    values (${input.name}, ${input.email}, ${await hashValue(input.password)})
    returning *
  `
  return ok(c, await issueAuth(rows[0], c.get('config')), 'Registered successfully', undefined, undefined, 201)
})

authRoutes.post('/login', async (c) => {
  const input = await jsonBody(c, loginSchema)
  const user = await findUserByEmail(input.email)
  if (!user || !(await verifyHash(input.password, (user as any).password_hash))) {
    throw new AppError('UNAUTHENTICATED', 'Invalid email or password', 401)
  }
  return ok(c, await issueAuth(user, c.get('config')), 'Logged in successfully')
})

authRoutes.post('/refresh', async (c) => {
  const { refreshToken } = await jsonBody(c, refreshSchema)
  const stored = await verifyStoredRefreshToken(refreshToken, c.get('config'))
  await sql`update refresh_tokens set revoked_at = now() where id = ${stored.id}`
  return ok(c, {
    accessToken: await signAccessToken(stored.user_id, c.get('config')),
    refreshToken: await createRefreshToken(stored.user_id, c.get('config')),
    tokenType: 'Bearer',
    expiresIn: 86400,
  }, 'Token refreshed successfully')
})

authRoutes.post('/logout', requireAuth, async (c) => {
  const { refreshToken } = await jsonBody(c, refreshSchema)
  await revokeRefreshToken(refreshToken, c.get('config'))
  return ok(c, { success: true }, 'Logged out successfully')
})

authRoutes.post('/forgot-password', async (c) => {
  const { email } = await jsonBody(c, forgotSchema)
  const user = await findUserByEmail(email)
  if (user) {
    const code = makeResetCode()
    await sql`
      insert into password_reset_codes (user_id, code_hash, expires_at)
      values (${user.id}, ${await hashValue(code)}, ${new Date(Date.now() + 60 * 60 * 1000).toISOString()})
    `
    await sendPasswordResetCode(c.get('config'), user.email, code)
  }
  return ok(c, { success: true }, 'Reset code sent to email')
})

authRoutes.post('/reset-password', async (c) => {
  const input = await jsonBody(c, resetSchema)
  const user = await findUserByEmail(input.email)
  if (!user) throw new AppError('UNPROCESSABLE_ENTITY', 'Invalid or expired reset code', 422)

  const codes = await sql<any[]>`
    select * from password_reset_codes
    where user_id = ${user.id} and used_at is null and expires_at > now()
    order by created_at desc
    limit 5
  `
  const match = await Promise.any(codes.map(async (row: any) => (await verifyHash(input.code.toUpperCase(), row.code_hash)) ? row : Promise.reject())).catch(() => null)
  if (!match) throw new AppError('UNPROCESSABLE_ENTITY', 'Invalid or expired reset code', 422)

  await sql.begin(async (tx: any) => {
    await tx`update users set password_hash = ${await hashValue(input.newPassword)}, updated_at = now() where id = ${user.id}`
    await tx`update password_reset_codes set used_at = now() where id = ${match.id}`
    await tx`update refresh_tokens set revoked_at = now() where user_id = ${user.id} and revoked_at is null`
  })
  return ok(c, { success: true }, 'Password reset successfully')
})
