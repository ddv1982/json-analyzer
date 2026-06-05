import { invoke } from '@tauri-apps/api/core'
import { browserMockInvoke } from '../browser-mocks'

type InvokePayload = Parameters<typeof invoke>[1]

export function invokeCommand<T>(command: string, args?: InvokePayload): Promise<T> {
  if (shouldUseBrowserMocks()) {
    return browserMockInvoke<T>(command, args)
  }

  return args === undefined ? invoke<T>(command) : invoke<T>(command, args)
}

function shouldUseBrowserMocks(): boolean {
  if (import.meta.env.MODE === 'test') {
    return false
  }

  if (typeof window === 'undefined') {
    return false
  }

  return import.meta.env.DEV && !('__TAURI_INTERNALS__' in window)
}
