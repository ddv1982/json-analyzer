import { describe, expect, it } from 'vitest'
import { generateBatchExampleValues } from './utils'

describe('curl executor batch example values', () => {
  it.each([
    [
      'uuid',
      '550e8400-e29b-41d4-a716-446655440000',
      '2f4c1f5a-1b7a-4a6d-8d76-4f5d4f2c8a91\n7c9e6679-7425-40de-944b-e07fc1f90ae7',
    ],
    ['integer', '123', '124\n125'],
    ['email', 'alice@example.com', 'user.one@example.com\nuser.two@example.com'],
    ['date', '2026-06-08', '2026-01-15\n2026-01-16'],
    ['timestamp', '2026-06-08T15:00:52Z', '2026-01-15T10:30:00Z\n2026-01-16T10:30:00Z'],
    ['slug', 'open-items', 'example-alpha\nexample-beta'],
    ['opaque token', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9', 'token-alpha-001\ntoken-beta-002'],
    ['empty', '', 'value-001\nvalue-002'],
    ['unknown', 'plain', 'value-001\nvalue-002'],
  ])('generates neutral examples for a %s target', (_shape, value, expected) => {
    expect(generateBatchExampleValues(value)).toBe(expected)
  })

  it('keeps generated examples URL-safe when the selected raw value is encoded', () => {
    expect(generateBatchExampleValues('alice%40example.com')).toBe('user.one%40example.com\nuser.two%40example.com')
    expect(generateBatchExampleValues('2026-06-08T15%3A00%3A52Z')).toBe(
      '2026-01-15T10%3A30%3A00Z\n2026-01-16T10%3A30%3A00Z',
    )
  })
})
