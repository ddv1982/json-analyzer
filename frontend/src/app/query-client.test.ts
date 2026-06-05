import { describe, expect, it } from 'vitest'
import { createAppQueryClient } from './query-client'

describe('app query client', () => {
  it('uses desktop command defaults without implicit retries or focus refetches', () => {
    const queryClient = createAppQueryClient()

    expect(queryClient.getDefaultOptions()).toMatchObject({
      queries: {
        retry: false,
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: false,
      },
    })
  })
})
