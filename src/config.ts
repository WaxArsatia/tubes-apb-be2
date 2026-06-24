import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().default('postgres://finu:finu@localhost:5432/finu'),
  JWT_ACCESS_SECRET: z.string().default('dev-access-secret-change-me'),
  JWT_REFRESH_SECRET: z.string().default('dev-refresh-secret-change-me'),
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().int().positive().default(1025),
  SMTP_USER: z.string().default(''),
  SMTP_PASS: z.string().default(''),
  SMTP_FROM: z.string().email().default('noreply@finu.local'),
  UPLOAD_DIR: z.string().default('uploads'),
  PUBLIC_BASE_URL: z.string().default('http://localhost:3000'),
  AUTO_MIGRATE: z.string().default('true'),
  ENABLE_DEMO_SEED: z.string().default('false'),
})

export type Config = ReturnType<typeof loadConfig>
export type RawEnv = Record<string, string | undefined>

const devAccessSecret = 'dev-access-secret-change-me'
const devRefreshSecret = 'dev-refresh-secret-change-me'

export function loadConfig(source: RawEnv = process.env) {
  const env = envSchema.parse(source)
  const isProduction = env.NODE_ENV === 'production'

  if (isProduction) {
    const issues: string[] = []
    if (!source.DATABASE_URL) issues.push('DATABASE_URL is required in production')
    if (!source.JWT_ACCESS_SECRET || env.JWT_ACCESS_SECRET === devAccessSecret || env.JWT_ACCESS_SECRET.length < 32) {
      issues.push('JWT_ACCESS_SECRET must be at least 32 characters and cannot use the development default')
    }
    if (!source.JWT_REFRESH_SECRET || env.JWT_REFRESH_SECRET === devRefreshSecret || env.JWT_REFRESH_SECRET.length < 32) {
      issues.push('JWT_REFRESH_SECRET must be at least 32 characters and cannot use the development default')
    }
    if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) issues.push('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different')
    for (const key of ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM', 'UPLOAD_DIR', 'PUBLIC_BASE_URL'] as const) {
      if (!source[key]) issues.push(`${key} is required in production`)
    }
    if (!/^https?:\/\//.test(env.PUBLIC_BASE_URL)) issues.push('PUBLIC_BASE_URL must be an absolute http(s) URL')
    if (issues.length) {
      throw new Error(`Invalid production configuration: ${issues.join('; ')}`)
    }
  }

  return {
    nodeEnv: env.NODE_ENV,
    port: env.PORT,
    databaseUrl: env.DATABASE_URL,
    jwtAccessSecret: env.JWT_ACCESS_SECRET,
    jwtRefreshSecret: env.JWT_REFRESH_SECRET,
    smtp: {
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
      from: env.SMTP_FROM,
    },
    uploadDir: env.UPLOAD_DIR,
    publicBaseUrl: env.PUBLIC_BASE_URL.replace(/\/$/, ''),
    autoMigrate: env.AUTO_MIGRATE === 'true',
    enableDemoSeed: env.ENABLE_DEMO_SEED === 'true',
  }
}
