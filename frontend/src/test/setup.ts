import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

type MediaChangeListener = (event: MediaQueryListEvent) => void

let prefersDark = false
const mediaListeners = new Set<MediaChangeListener>()
const localStorageData = new Map<string, string>()

Object.defineProperty(window, 'localStorage', {
  configurable: true,
  value: {
    get length() {
      return localStorageData.size
    },
    clear: vi.fn(() => localStorageData.clear()),
    getItem: vi.fn((key: string) => localStorageData.get(key) ?? null),
    key: vi.fn((index: number) => Array.from(localStorageData.keys())[index] ?? null),
    removeItem: vi.fn((key: string) => {
      localStorageData.delete(key)
    }),
    setItem: vi.fn((key: string, value: string) => {
      localStorageData.set(key, String(value))
    }),
  } satisfies Storage,
})

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn((query: string): MediaQueryList => {
    const mediaQueryList: MediaQueryList = {
      matches: query === '(prefers-color-scheme: dark)' && prefersDark,
      media: query,
      onchange: null,
      addEventListener: vi.fn((eventName: string, listener: EventListenerOrEventListenerObject) => {
        if (eventName === 'change' && typeof listener === 'function') {
          mediaListeners.add(listener as MediaChangeListener)
        }
      }),
      removeEventListener: vi.fn((eventName: string, listener: EventListenerOrEventListenerObject) => {
        if (eventName === 'change' && typeof listener === 'function') {
          mediaListeners.delete(listener as MediaChangeListener)
        }
      }),
      addListener: vi.fn((listener: MediaChangeListener) => mediaListeners.add(listener)),
      removeListener: vi.fn((listener: MediaChangeListener) => mediaListeners.delete(listener)),
      dispatchEvent: vi.fn(() => true),
    }
    return mediaQueryList
  }),
})

export function setMockPrefersColorScheme(theme: 'light' | 'dark') {
  prefersDark = theme === 'dark'
  const event = { matches: prefersDark, media: '(prefers-color-scheme: dark)' } as MediaQueryListEvent
  mediaListeners.forEach((listener) => listener(event))
}

afterEach(() => {
  cleanup()
  prefersDark = false
  mediaListeners.clear()
  window.localStorage.clear()
  vi.mocked(window.matchMedia).mockClear()
  vi.mocked(window.localStorage.clear).mockClear()
  vi.mocked(window.localStorage.getItem).mockClear()
  vi.mocked(window.localStorage.key).mockClear()
  vi.mocked(window.localStorage.removeItem).mockClear()
  vi.mocked(window.localStorage.setItem).mockClear()
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.removeAttribute('data-theme-preference')
  document.documentElement.style.colorScheme = ''
})
