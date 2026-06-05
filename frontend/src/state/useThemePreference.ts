import { useEffect, useMemo, useState } from 'react'

export const THEME_STORAGE_KEY = 'json-analyzer.themePreference'
export const THEME_PREFERENCES = ['system', 'light', 'dark'] as const

export type ThemePreference = (typeof THEME_PREFERENCES)[number]
export type ResolvedTheme = 'light' | 'dark'

export function parseThemePreference(value: unknown): ThemePreference {
  return typeof value === 'string' && THEME_PREFERENCES.includes(value as ThemePreference)
    ? (value as ThemePreference)
    : 'system'
}

function safeReadStoredPreference(): ThemePreference {
  if (typeof window === 'undefined') {
    return 'system'
  }

  try {
    return parseThemePreference(window.localStorage.getItem(THEME_STORAGE_KEY))
  } catch {
    return 'system'
  }
}

function safeStorePreference(preference: ThemePreference) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference)
  } catch {
    // Storage can be blocked in embedded/webview contexts; the in-memory preference still works.
  }
}

function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'light'
  }

  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

function applyThemeAttributes(preference: ThemePreference, resolvedTheme: ResolvedTheme) {
  if (typeof document === 'undefined') {
    return
  }

  const root = document.documentElement
  root.dataset.themePreference = preference
  root.dataset.theme = resolvedTheme
  root.style.colorScheme = resolvedTheme
}

export function useThemePreference() {
  const [preference, setPreferenceState] = useState<ThemePreference>(() => safeReadStoredPreference())
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() => getSystemTheme())

  const resolvedTheme = useMemo<ResolvedTheme>(
    () => (preference === 'system' ? systemTheme : preference),
    [preference, systemTheme],
  )

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined
    }

    let mediaQuery: MediaQueryList
    try {
      mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    } catch {
      return undefined
    }

    const handleChange = (event: MediaQueryListEvent | MediaQueryList) => {
      setSystemTheme(event.matches ? 'dark' : 'light')
    }

    handleChange(mediaQuery)

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleChange)
      return () => mediaQuery.removeEventListener('change', handleChange)
    }

    mediaQuery.addListener?.(handleChange)
    return () => mediaQuery.removeListener?.(handleChange)
  }, [])

  useEffect(() => {
    safeStorePreference(preference)
    applyThemeAttributes(preference, resolvedTheme)
  }, [preference, resolvedTheme])

  const setPreference = (nextPreference: ThemePreference) => {
    setPreferenceState(parseThemePreference(nextPreference))
  }

  return { preference, resolvedTheme, setPreference }
}
