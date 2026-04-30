import type { Config } from '../config'
import { findUserByEmail, hashValue } from '../modules/auth/service'
import { sql } from './client'

export const demoSeedEmail = 'demo@finu.local'
export const demoSeedPassword = 'password123'

type SeedConfig = Pick<Config, 'demoSeedEnabled'>

const expenseCategories = [
  { key: 'groceries', name: 'Groceries', iconKey: 'shopping-cart', monthlyBudget: 2_500_000 },
  { key: 'transport', name: 'Transport', iconKey: 'bus', monthlyBudget: 900_000 },
  { key: 'housing', name: 'Housing', iconKey: 'home', monthlyBudget: 3_500_000 },
  { key: 'dining', name: 'Dining Out', iconKey: 'utensils', monthlyBudget: 1_200_000 },
  { key: 'health', name: 'Health', iconKey: 'heart-pulse', monthlyBudget: 800_000 },
] as const

const savingCategories = [
  { key: 'emergency', name: 'Emergency Fund', iconKey: 'shield', savingTarget: 15_000_000 },
  { key: 'vacation', name: 'Bali Trip', iconKey: 'plane', savingTarget: 8_000_000 },
  { key: 'laptop', name: 'New Laptop', iconKey: 'laptop', savingTarget: 18_000_000 },
] as const

const generalIncomes = [
  { name: 'Monthly Salary', amount: 8_500_000, date: '2026-04-01', note: 'Demo salary for April' },
  { name: 'Freelance Project', amount: 2_250_000, date: '2026-04-12', note: 'Public demo side income' },
] as const

const savingEntries = [
  { categoryKey: 'emergency', name: 'Emergency Fund Deposit', amount: 1_500_000, date: '2026-04-03', note: 'Routine emergency allocation' },
  { categoryKey: 'vacation', name: 'Bali Trip Deposit', amount: 750_000, date: '2026-04-08', note: 'Flights and hotel savings' },
  { categoryKey: 'laptop', name: 'New Laptop Deposit', amount: 1_250_000, date: '2026-04-15', note: 'Work setup savings' },
  { categoryKey: 'emergency', name: 'Extra Emergency Top Up', amount: 500_000, date: '2026-04-22', note: 'Unused weekly budget' },
] as const

const transactions = [
  { categoryKey: 'groceries', name: 'Weekly Groceries', amount: 640_000, date: '2026-04-04', note: 'Rice, vegetables, and household supplies' },
  { categoryKey: 'transport', name: 'Commuter Card Top Up', amount: 250_000, date: '2026-04-05', note: 'MRT and bus balance' },
  { categoryKey: 'housing', name: 'Apartment Rent', amount: 3_200_000, date: '2026-04-06', note: 'Monthly rent demo expense' },
  { categoryKey: 'dining', name: 'Team Dinner', amount: 420_000, date: '2026-04-14', note: 'Dinner with classmates' },
  { categoryKey: 'health', name: 'Pharmacy', amount: 185_000, date: '2026-04-18', note: 'Vitamins and medicine' },
  { categoryKey: 'groceries', name: 'Mini Market', amount: 275_000, date: '2026-04-24', note: 'Snacks and cleaning supplies' },
  { categoryKey: 'transport', name: 'Ride Hailing', amount: 135_000, date: '2026-04-27', note: 'Late-night ride home' },
] as const

export async function ensureDemoSeed(config: SeedConfig) {
  if (!config.demoSeedEnabled) return
  if (await findUserByEmail(demoSeedEmail)) return

  const passwordHash = await hashValue(demoSeedPassword)

  await sql.begin(async (tx) => {
    const users = await tx<{ id: string }[]>`
      insert into users (name, email, password_hash, profile_photo_url, budget_notification_enabled)
      values (${'Demo User'}, ${demoSeedEmail}, ${passwordHash}, ${null}, ${true})
      returning id
    `
    const userId = users[0].id
    const categoryIds = new Map<string, string>()

    for (const category of expenseCategories) {
      const rows = await tx<{ id: string }[]>`
        insert into categories (user_id, type, name, icon_key, monthly_budget, saving_target)
        values (${userId}, ${'expense'}, ${category.name}, ${category.iconKey}, ${category.monthlyBudget}, ${null})
        returning id
      `
      categoryIds.set(category.key, rows[0].id)
    }

    for (const category of savingCategories) {
      const rows = await tx<{ id: string }[]>`
        insert into categories (user_id, type, name, icon_key, monthly_budget, saving_target)
        values (${userId}, ${'saving'}, ${category.name}, ${category.iconKey}, ${null}, ${category.savingTarget})
        returning id
      `
      categoryIds.set(category.key, rows[0].id)
    }

    for (const income of generalIncomes) {
      await tx`
        insert into savings (user_id, type, name, amount, category_id, date, note)
        values (${userId}, ${'general_income'}, ${income.name}, ${income.amount}, ${null}, ${income.date}, ${income.note})
      `
    }

    for (const saving of savingEntries) {
      await tx`
        insert into savings (user_id, type, name, amount, category_id, date, note)
        values (${userId}, ${'saving'}, ${saving.name}, ${saving.amount}, ${categoryIds.get(saving.categoryKey)!}, ${saving.date}, ${saving.note})
      `
    }

    for (const transaction of transactions) {
      await tx`
        insert into transactions (user_id, name, amount, category_id, date, note)
        values (${userId}, ${transaction.name}, ${transaction.amount}, ${categoryIds.get(transaction.categoryKey)!}, ${transaction.date}, ${transaction.note})
      `
    }
  })
}
