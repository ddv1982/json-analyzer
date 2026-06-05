import { beforeEach, describe, expect, it } from 'vitest'
import { resetAppUiStoreForTests, useAppUiStore } from './useAppUiStore'

describe('useAppUiStore', () => {
  beforeEach(() => {
    localStorage.clear()
    resetAppUiStoreForTests()
  })

  it('stores lightweight navigation state', () => {
    useAppUiStore.getState().setActiveView('curl-executor')
    useAppUiStore.getState().setActiveResultsTab('duplicates')

    expect(useAppUiStore.getState()).toMatchObject({
      activeView: 'curl-executor',
      activeResultsTab: 'duplicates',
    })

    useAppUiStore.getState().resetResultsNavigation()

    expect(useAppUiStore.getState().activeResultsTab).toBe('statistics')
  })

  it('persists only safe shell preferences', () => {
    useAppUiStore.getState().setActiveView('curl-executor')
    useAppUiStore.getState().setActiveResultsTab('duplicates')

    const persisted = JSON.parse(localStorage.getItem('json-analyzer.ui') ?? '{}')

    expect(persisted.state).toEqual({ activeView: 'curl-executor' })
    expect(JSON.stringify(persisted)).not.toContain('duplicates')
    expect(JSON.stringify(persisted)).not.toContain('json_string')
    expect(JSON.stringify(persisted)).not.toContain('curl https://')
  })
})
