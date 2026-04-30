import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/bun'
import type { Config } from './config'
import { handleError } from './http/errors'
import { authRoutes } from './modules/auth/routes'
import { profileRoutes } from './modules/profile/routes'
import { categoryRoutes } from './modules/categories/routes'
import { transactionRoutes } from './modules/transactions/routes'
import { savingRoutes } from './modules/savings/routes'
import { activityRoutes } from './modules/activities/routes'

export type AppEnv = {
  Variables: {
    userId: string
    config: Config
  }
}

export function createApp(config: Config) {
  const app = new Hono<AppEnv>()

  app.use('*', async (c, next) => {
    c.set('config', config)
    await next()
  })
  app.use('*', cors())
  app.use('/uploads/*', serveStatic({ root: './' }))

  app.route('/auth', authRoutes)
  app.route('/profile', profileRoutes)
  app.route('/settings', profileRoutes)
  app.route('/categories', categoryRoutes)
  app.route('/transactions', transactionRoutes)
  app.route('/savings', savingRoutes)
  app.route('/activities', activityRoutes)

  app.onError(handleError)
  app.notFound((c) => c.json({ error: { code: 'NOT_FOUND', message: 'Route not found' } }, 404))

  return app
}
