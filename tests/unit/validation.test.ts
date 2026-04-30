import { describe, expect, test } from 'bun:test'
import { dateOnlySchema, moneySchema } from '../../src/http/validation'

describe('validation helpers', () => {
  test('accepts positive integer IDR amounts only', () => {
    expect(moneySchema.parse(25_000)).toBe(25_000)
    expect(() => moneySchema.parse(0)).toThrow()
    expect(() => moneySchema.parse(10.5)).toThrow()
  })

  test('rejects future finance dates', () => {
    expect(dateOnlySchema.parse('2026-04-30')).toBe('2026-04-30')
    expect(() => dateOnlySchema.parse('2999-01-01')).toThrow(/future/)
  })
})
