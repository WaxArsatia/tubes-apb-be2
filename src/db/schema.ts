import { boolean, index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid, varchar, date } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

export const categoryType = pgEnum('category_type', ['expense', 'saving'])
export const savingType = pgEnum('saving_type', ['general_income', 'saving'])

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 120 }).notNull(),
  email: varchar('email', { length: 255 }).notNull(),
  passwordHash: text('password_hash').notNull(),
  profilePhotoUrl: text('profile_photo_url'),
  budgetNotificationEnabled: boolean('budget_notification_enabled').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  emailUnique: uniqueIndex('users_email_unique').on(sql`lower(${table.email})`),
}))

export const refreshTokens = pgTable('refresh_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userIdx: index('refresh_tokens_user_idx').on(table.userId),
  tokenUnique: uniqueIndex('refresh_tokens_hash_unique').on(table.tokenHash),
}))

export const passwordResetCodes = pgTable('password_reset_codes', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  codeHash: text('code_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const categories = pgTable('categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: categoryType('type').notNull(),
  name: varchar('name', { length: 120 }).notNull(),
  iconKey: varchar('icon_key', { length: 80 }).notNull(),
  monthlyBudget: integer('monthly_budget'),
  savingTarget: integer('saving_target'),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  restoreExpiresAt: timestamp('restore_expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  activeNameUnique: uniqueIndex('categories_user_type_name_active_unique')
    .on(table.userId, table.type, sql`lower(${table.name})`)
    .where(sql`${table.deletedAt} is null`),
}))

export const transactions = pgTable('transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 160 }).notNull(),
  amount: integer('amount').notNull(),
  categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
  date: date('date').notNull(),
  note: text('note'),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  restoreExpiresAt: timestamp('restore_expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userDateIdx: index('transactions_user_date_idx').on(table.userId, table.date),
}))

export const savings = pgTable('savings', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: savingType('type').notNull(),
  name: varchar('name', { length: 160 }).notNull(),
  amount: integer('amount').notNull(),
  categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
  date: date('date').notNull(),
  note: text('note'),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  restoreExpiresAt: timestamp('restore_expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userDateIdx: index('savings_user_date_idx').on(table.userId, table.date),
}))

export const categoryRestoreLinks = pgTable('category_restore_links', {
  id: uuid('id').primaryKey().defaultRandom(),
  categoryId: uuid('category_id').notNull().references(() => categories.id, { onDelete: 'cascade' }),
  recordKind: varchar('record_kind', { length: 20 }).notNull(),
  recordId: uuid('record_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  categoryIdx: index('category_restore_links_category_idx').on(table.categoryId),
}))
