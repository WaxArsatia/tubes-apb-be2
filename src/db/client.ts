import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { loadConfig } from '../config'
import * as schema from './schema'

const config = loadConfig()
export const sql = postgres(config.databaseUrl, { max: 10 })
export const db = drizzle(sql, { schema })

export async function pingDatabase() {
  try {
    await sql`select 1`
    return true
  } catch {
    return false
  }
}

export async function ensureSchema() {
  await sql`create extension if not exists "pgcrypto"`
  await migrate(db, { migrationsFolder: './migrations' })
}

export async function resetDatabaseForTests() {
  await sql`truncate category_restore_links, transactions, savings, categories, password_reset_codes, refresh_tokens, users restart identity cascade`
}

export async function resetSchemaForTests() {
  await sql`drop schema if exists public cascade`
  await sql`create schema public`
  await sql`create extension if not exists "pgcrypto"`
  await sql`drop schema if exists drizzle cascade`
}
