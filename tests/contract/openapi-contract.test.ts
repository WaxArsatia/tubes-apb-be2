import { describe, expect, test } from 'bun:test'
import { checkOpenApiContract } from '../../scripts/check-openapi-contract'

describe('OpenAPI route contract', () => {
  test('implements every documented endpoint with no unexpected extras except health', async () => {
    const result = await checkOpenApiContract()
    expect(result.missing).toEqual([])
    expect(result.extra).toEqual([])
    expect(result.documented.length).toBeGreaterThan(20)
  })
})
