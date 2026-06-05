import { afterEach, describe, expect, it, vi } from 'vitest'

const invokeMock = vi.fn()
const browserMockInvokeMock = vi.fn()

afterEach(() => {
  Reflect.deleteProperty(window, '__TAURI_INTERNALS__')
  vi.unstubAllEnvs()
  vi.doUnmock('@tauri-apps/api/core')
  vi.doUnmock('./browser-mocks')
  vi.resetModules()
  invokeMock.mockReset()
  browserMockInvokeMock.mockReset()
})

function mockCommandAdapters() {
  vi.doMock('@tauri-apps/api/core', () => ({
    invoke: invokeMock,
  }))
  vi.doMock('./browser-mocks', () => ({
    browserMockInvoke: browserMockInvokeMock,
  }))
}

async function importCommandsWithEnv(mode: string, dev: boolean) {
  vi.resetModules()
  mockCommandAdapters()
  vi.stubEnv('MODE', mode)
  vi.stubEnv('DEV', dev)
  Reflect.deleteProperty(window, '__TAURI_INTERNALS__')

  return import('./commands')
}

describe('Tauri command browser fallback', () => {
  it('uses browserMockInvoke in dev mode when Tauri internals are absent', async () => {
    const validateResponse = {
      valid: true,
      document_count: 1,
      compact_json: '{}',
      warnings: [],
    }
    const healthResponse = { status: 'ok', app: 'json-analyzer', version: 'browser-mock' }
    browserMockInvokeMock.mockResolvedValueOnce(validateResponse).mockResolvedValueOnce(healthResponse)

    const { getHealth, validateJson } = await importCommandsWithEnv('development', true)

    await expect(validateJson({ json_string: '{}' })).resolves.toBe(validateResponse)
    await expect(getHealth()).resolves.toBe(healthResponse)

    expect(browserMockInvokeMock).toHaveBeenNthCalledWith(1, 'validate_json', {
      request: { json_string: '{}' },
    })
    expect(browserMockInvokeMock).toHaveBeenNthCalledWith(2, 'get_health', undefined)
    expect(invokeMock).not.toHaveBeenCalled()
  })

  it('keeps using Tauri invoke in normal Vitest test mode', async () => {
    const healthResponse = { status: 'ok', app: 'json-analyzer', version: 'tauri' }
    invokeMock.mockResolvedValueOnce(healthResponse)

    const { getHealth } = await importCommandsWithEnv('test', true)

    await expect(getHealth()).resolves.toBe(healthResponse)

    expect(invokeMock).toHaveBeenCalledWith('get_health')
    expect(browserMockInvokeMock).not.toHaveBeenCalled()
  })
})
