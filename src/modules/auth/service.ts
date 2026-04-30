import { SignJWT, jwtVerify } from 'jose'
import { sql } from '../../db/client'
import type { Config } from '../../config'
import { AppError } from '../../http/errors'
import { iso } from '../../utils/time'

const accessTtlSeconds = 24 * 60 * 60
const refreshTtlSeconds = 30 * 24 * 60 * 60

type UserRow = {
  id: string
  name: string
  email: string
  profile_photo_url: string | null
  budget_notification_enabled: boolean
  created_at: Date
  updated_at: Date
}

export function userDto(user: UserRow) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    profilePhotoUrl: user.profile_photo_url,
    budgetNotificationEnabled: user.budget_notification_enabled,
    createdAt: iso(user.created_at),
    updatedAt: iso(user.updated_at),
  }
}

function secret(value: string) {
  return new TextEncoder().encode(value)
}

export async function hashValue(value: string) {
  return Bun.password.hash(value, { algorithm: 'bcrypt', cost: 10 })
}

export async function verifyHash(value: string, hash: string) {
  return Bun.password.verify(value, hash)
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function signAccessToken(userId: string, config: Config) {
  return new SignJWT({ sub: userId, typ: 'access' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${accessTtlSeconds}s`)
    .sign(secret(config.jwtAccessSecret))
}

export async function verifyAccessToken(token: string, config: Config) {
  try {
    const { payload } = await jwtVerify(token, secret(config.jwtAccessSecret))
    if (payload.typ !== 'access' || typeof payload.sub !== 'string') throw new Error('Invalid token')
    return payload.sub
  } catch {
    throw new AppError('UNAUTHENTICATED', 'Invalid or expired access token', 401)
  }
}

export async function createRefreshToken(userId: string, config: Config) {
  const tokenId = crypto.randomUUID()
  const token = await new SignJWT({ sub: userId, jti: tokenId, typ: 'refresh' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${refreshTtlSeconds}s`)
    .sign(secret(config.jwtRefreshSecret))
  await sql`
    insert into refresh_tokens (id, user_id, token_hash, expires_at)
    values (${tokenId}, ${userId}, ${await sha256(token)}, ${new Date(Date.now() + refreshTtlSeconds * 1000).toISOString()})
  `
  return token
}

export async function verifyStoredRefreshToken(token: string, config: Config) {
  try {
    const { payload } = await jwtVerify(token, secret(config.jwtRefreshSecret))
    if (payload.typ !== 'refresh' || typeof payload.sub !== 'string' || typeof payload.jti !== 'string') {
      throw new Error('Invalid token')
    }
    const rows = await sql<{ id: string; user_id: string }[]>`
      select id, user_id from refresh_tokens
      where id = ${payload.jti}
        and user_id = ${payload.sub}
        and token_hash = ${await sha256(token)}
        and revoked_at is null
        and expires_at > now()
      limit 1
    `
    if (!rows[0]) throw new Error('Refresh token not active')
    return rows[0]
  } catch {
    throw new AppError('UNAUTHENTICATED', 'Invalid or expired refresh token', 401)
  }
}

export async function revokeRefreshToken(token: string, config: Config) {
  const stored = await verifyStoredRefreshToken(token, config)
  await sql`update refresh_tokens set revoked_at = now() where id = ${stored.id}`
}

export async function issueAuth(user: UserRow, config: Config) {
  return {
    user: userDto(user),
    accessToken: await signAccessToken(user.id, config),
    refreshToken: await createRefreshToken(user.id, config),
    tokenType: 'Bearer',
    expiresIn: accessTtlSeconds,
  }
}

export async function findUserByEmail(email: string) {
  const rows = await sql<UserRow[]>`select * from users where lower(email) = lower(${email}) limit 1`
  return rows[0] ?? null
}

export async function findUserById(id: string) {
  const rows = await sql<UserRow[]>`select * from users where id = ${id} limit 1`
  return rows[0] ?? null
}

export function makeResetCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)]
  return code
}
