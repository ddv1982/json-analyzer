import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  formatJsonMock,
  loadFixtureAnalysis,
  renderApp,
  sampleJsonInput,
  setMockPrefersColorScheme,
  setupDefaultAppMocks,
  validateJsonMock,
} from './test/app-test-harness'

describe('App frontend MVP workflow', () => {
  beforeAll(async () => {
    await loadFixtureAnalysis()
  })

  beforeEach(() => {
    setupDefaultAppMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders the JSON input and empty results state before analysis', () => {
    renderApp()

    expect(screen.queryByRole('radio', { name: /system/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /theme: light\. open theme menu/i })).toBeEnabled()
    expect(screen.getByRole('textbox', { name: /json input/i })).toHaveValue(sampleJsonInput)
    expect(screen.getByRole('button', { name: /load example/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: /format/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: /clear/i })).toBeEnabled()
    expect(screen.getByRole('checkbox', { name: /flatten nested arrays/i })).not.toBeChecked()
    expect(screen.queryByRole('button', { name: /validate json/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /analyze json/i })).toBeEnabled()
    expect(screen.getAllByText(/ready to analyze/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/validate json and explore statistics, values and duplicates/i).length).toBeGreaterThan(0)
    expect(screen.queryByText(/local-first desktop mvp/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/pdf export is intentionally deferred/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/rust service/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/in-memory async jobs/i)).not.toBeInTheDocument()
  })

  it('persists theme preference and updates root theme attributes', async () => {
    window.localStorage.setItem('json-analyzer.themePreference', 'unknown')
    setMockPrefersColorScheme('dark')

    renderApp()

    expect(screen.queryByRole('radio', { name: /system/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: /light/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: /dark/i })).not.toBeInTheDocument()
    await waitFor(() => {
      expect(document.documentElement).toHaveAttribute('data-theme-preference', 'system')
      expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
      expect(document.documentElement.style.colorScheme).toBe('dark')
      expect(window.localStorage.getItem('json-analyzer.themePreference')).toBe('system')
    })

    fireEvent.click(screen.getByRole('button', { name: /theme: dark\. open theme menu/i }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: /^light$/i }))
    await waitFor(() => {
      expect(document.documentElement).toHaveAttribute('data-theme-preference', 'light')
      expect(document.documentElement).toHaveAttribute('data-theme', 'light')
      expect(document.documentElement.style.colorScheme).toBe('light')
      expect(window.localStorage.getItem('json-analyzer.themePreference')).toBe('light')
    })

    fireEvent.click(screen.getByRole('button', { name: /theme: light\. open theme menu/i }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: /^dark$/i }))
    await waitFor(() => {
      expect(document.documentElement).toHaveAttribute('data-theme-preference', 'dark')
      expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
      expect(window.localStorage.getItem('json-analyzer.themePreference')).toBe('dark')
    })

    setMockPrefersColorScheme('light')
    await waitFor(() => {
      expect(document.documentElement).toHaveAttribute('data-theme-preference', 'dark')
      expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
      expect(document.documentElement.style.colorScheme).toBe('dark')
    })
  })

  it('keeps stored system theme compatibility with the compact theme menu', async () => {
    window.localStorage.setItem('json-analyzer.themePreference', 'system')
    setMockPrefersColorScheme('dark')

    renderApp()

    expect(screen.queryByRole('radio', { name: /system/i })).not.toBeInTheDocument()
    await waitFor(() => {
      expect(document.documentElement).toHaveAttribute('data-theme-preference', 'system')
      expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
      expect(screen.getByRole('button', { name: /theme: dark\. open theme menu/i })).toBeEnabled()
    })

    setMockPrefersColorScheme('light')
    await waitFor(() => {
      expect(document.documentElement).toHaveAttribute('data-theme-preference', 'system')
      expect(document.documentElement).toHaveAttribute('data-theme', 'light')
      expect(document.documentElement.style.colorScheme).toBe('light')
      expect(screen.getByRole('button', { name: /theme: light\. open theme menu/i })).toBeEnabled()
    })

    fireEvent.click(screen.getByRole('button', { name: /theme: light\. open theme menu/i }))
    expect(screen.getByRole('menuitemradio', { name: /^system$/i })).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(screen.getByRole('menuitemradio', { name: /^dark$/i }))
    await waitFor(() => {
      expect(document.documentElement).toHaveAttribute('data-theme-preference', 'dark')
      expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    })
  })

  it('disables actions only for truly empty input', () => {
    renderApp()

    fireEvent.change(screen.getByRole('textbox', { name: /json input/i }), { target: { value: '' } })

    expect(screen.getByRole('button', { name: /format/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /clear/i })).toBeDisabled()
    expect(screen.queryByRole('button', { name: /validate json/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /analyze json/i })).toBeDisabled()

    fireEvent.change(screen.getByRole('textbox', { name: /json input/i }), { target: { value: '  \n\t  ' } })

    expect(screen.queryByRole('button', { name: /validate json/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /analyze json/i })).toBeEnabled()
  })

  it('debounces validation while editing without blocking the editor', async () => {
    vi.useFakeTimers()
    renderApp()

    fireEvent.change(screen.getByRole('textbox', { name: /json input/i }), {
      target: { value: '{"debounced":true}' },
    })

    expect(screen.getByRole('textbox', { name: /json input/i })).toBeEnabled()
    expect(validateJsonMock).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500)
      await Promise.resolve()
    })

    expect(screen.getByLabelText(/validation result/i)).toHaveTextContent(/json is valid/i)
    expect(validateJsonMock).toHaveBeenCalledWith({ json_string: '{"debounced":true}' })
  })

  it('formats via the duplicate-preserving command, clears, and reloads example JSON', async () => {
    formatJsonMock.mockResolvedValueOnce({ formatted_json: '{\n  "z": 1,\n  "z": 2\n}' })
    renderApp()
    const editor = screen.getByRole('textbox', { name: /json input/i })

    fireEvent.change(editor, { target: { value: '{"z":1,"z":2}' } })
    fireEvent.click(screen.getByRole('button', { name: /format/i }))
    await waitFor(() => {
      expect(editor).toHaveValue('{\n  "z": 1,\n  "z": 2\n}')
    })
    expect(formatJsonMock).toHaveBeenCalledWith({ json_string: '{"z":1,"z":2}' })

    fireEvent.click(screen.getByRole('button', { name: /clear/i }))
    expect(editor).toHaveValue('')
    expect(screen.getByRole('button', { name: /analyze json/i })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: /load example/i }))
    expect(editor).toHaveValue(sampleJsonInput)
  })

  it('clears previous validation and analysis results when input changes', async () => {
    renderApp()
    fireEvent.click(screen.getByRole('button', { name: /analyze json/i }))

    expect(await screen.findByLabelText(/statistics result view/i)).toBeInTheDocument()

    fireEvent.change(screen.getByRole('textbox', { name: /json input/i }), {
      target: { value: '{"changed":true}' },
    })

    expect(screen.queryByLabelText(/statistics result view/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/validation result/i)).not.toBeInTheDocument()
    expect(screen.getAllByText(/ready to analyze/i).length).toBeGreaterThan(0)
  })
})
