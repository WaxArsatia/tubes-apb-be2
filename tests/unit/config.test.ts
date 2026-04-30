import { describe, expect, test } from 'bun:test'
import { loadConfig } from '../../src/config'

const completeProductionEnv = {
  NODE_ENV: 'production',
  PORT: '3000',
  DATABASE_URL: 'postgres://finu:secret@postgres:5432/finu',
  JWT_ACCESS_SECRET: 'access-secret-with-at-least-thirty-two-chars',
  JWT_REFRESH_SECRET: 'refresh-secret-with-at-least-thirty-two-chars',
  SMTP_HOST: 'smtp.example.com',
  SMTP_PORT: '587',
  SMTP_USER: 'user',
  SMTP_PASS: 'pass',
  SMTP_FROM: 'noreply@example.com',
  UPLOAD_DIR: '/app/uploads',
  PUBLIC_BASE_URL: 'https://api.example.com',
  AUTO_MIGRATE: 'true',
}

describe('config validation', () => {
  test('allows development defaults', () => {
    const config = loadConfig({})
    expect(config.nodeEnv).toBe('development')
    expect(config.autoMigrate).toBe(true)
  })

  test('rejects unsafe production defaults', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(/Invalid production configuration/)
  })

  test('accepts complete production config', () => {
    const config = loadConfig(completeProductionEnv)
    expect(config.nodeEnv).toBe('production')
    expect(config.publicBaseUrl).toBe('https://api.example.com')
  })

  test('enables demo seed by default outside production', () => {
    expect(loadConfig({ NODE_ENV: 'development' }).demoSeedEnabled).toBe(true)
    expect(loadConfig({ NODE_ENV: 'test' }).demoSeedEnabled).toBe(true)
  })

  test('disables demo seed by default in production', () => {
    expect(loadConfig(completeProductionEnv).demoSeedEnabled).toBe(false)
  })

  test('allows explicit demo seed override', () => {
    expect(loadConfig({ NODE_ENV: 'development', DEMO_SEED_ENABLED: 'false' }).demoSeedEnabled).toBe(false)
    expect(loadConfig({ ...completeProductionEnv, DEMO_SEED_ENABLED: 'true' }).demoSeedEnabled).toBe(true)
  })
})
