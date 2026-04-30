import { createApp } from './app'
import { loadConfig } from './config'
import { ensureSchema, pingDatabase } from './db/client'

const config = loadConfig()

if (config.autoMigrate) {
  await ensureSchema()
}

const app = createApp(config)

app.get('/health', async (c) => {
  const database = await pingDatabase()
  return c.json({
    data: {
      service: 'ok',
      database: database ? 'ok' : 'unavailable',
      timestamp: new Date().toISOString(),
    },
    message: database ? 'Service is healthy' : 'Service is degraded',
  }, database ? 200 : 503)
})

export default {
  port: config.port,
  fetch: app.fetch,
}
