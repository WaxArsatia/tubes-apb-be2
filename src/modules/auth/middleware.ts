import { createMiddleware } from 'hono/factory'
import type { AppEnv } from '../../app'
import { AppError } from '../../http/errors'
import { verifyAccessToken } from './service'

export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const header = c.req.header('authorization')
  if (!header?.startsWith('Bearer ')) {
    throw new AppError('UNAUTHENTICATED', 'Bearer token is required', 401)
  }

  const userId = await verifyAccessToken(header.slice('Bearer '.length), c.get('config'))
  c.set('userId', userId)
  await next()
})
