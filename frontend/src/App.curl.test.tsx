import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  appConfig,
  cancelCurlJobMock,
  curlJobCanceledResults,
  curlJobStarted,
  curlJobSucceeded,
  executeCurlMock,
  getConfigMock,
  getCurlJobResultsMock,
  loadFixtureAnalysis,
  renderApp,
  setupDefaultAppMocks,
  startCurlJobMock,
  unlockCurlBatchMode,
  writeClipboardTextMock,
  type CurlJobResponse,
  type CurlJobResultsResponse,
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

  it('navigates to Curl Executor and executes one guarded request', async () => {
    renderApp()

    fireEvent.click(screen.getByRole('button', { name: /curl executor/i }))

    expect(screen.getByRole('heading', { name: /curl executor/i })).toBeInTheDocument()
    expect((screen.getByRole('textbox', { name: /curl command input/i }) as HTMLTextAreaElement).value).toContain('curl -X POST')
    expect(screen.getByRole('button', { name: /^execute$/i })).toBeEnabled()
    expect(screen.queryByRole('button', { name: /preview request/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /start background run/i })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /^execute$/i }))
    expect(startCurlJobMock).toHaveBeenCalledWith({
      curls: [expect.stringContaining('https://api.example.com/users')],
      timeout_ms: null,
      follow_redirects: true,
      confirm_large_batch: false,
    })
    expect(await screen.findByRole('button', { name: /stop/i })).toBeEnabled()
    const response = await screen.findByLabelText(/curl execution response/i)
    expect(executeCurlMock).not.toHaveBeenCalled()
    expect(response).toHaveTextContent('200 OK')
    expect(response).toHaveTextContent('Complete within limit')
    expect(response).toHaveTextContent('Set-Cookie')
    expect(response).toHaveTextContent('Redacted')
    fireEvent.click(within(response).getByRole('button', { name: /copy response/i }))
    await waitFor(() => {
      expect(writeClipboardTextMock).toHaveBeenCalledWith('{"ok":true}')
    })
    expect(within(response).getByRole('button', { name: /copied/i })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /^clear$/i }))
    expect(screen.getByRole('textbox', { name: /curl command input/i })).toHaveValue('')
    expect(screen.queryByLabelText(/curl execution response/i)).not.toBeInTheDocument()
  })

  it('disables Curl Executor actions when global curl execution is disabled by configuration', async () => {
    getConfigMock.mockResolvedValueOnce({
      config: {
        ...appConfig.config,
        limits: {
          ...appConfig.config.limits,
          curl: {
            ...appConfig.config.limits.curl,
            enabled: false,
          },
        },
      },
    })
    renderApp()

    fireEvent.click(screen.getByRole('button', { name: /curl executor/i }))

    expect(await screen.findByText(/curl execution is disabled by configuration/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^execute$/i })).toBeDisabled()
    expect(screen.queryByRole('button', { name: /preview request/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /start background run/i })).not.toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /batch/i })).toBeDisabled()
  })

  it('disables only single Curl Executor execution when the single-request flag is disabled', async () => {
    getConfigMock.mockResolvedValueOnce({
      config: {
        ...appConfig.config,
        features: {
          ...appConfig.config.features,
          curl_single_request_execution: false,
        },
      },
    })
    renderApp()

    fireEvent.click(screen.getByRole('button', { name: /curl executor/i }))

    expect(await screen.findByText(/single request execution is disabled by configuration/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^execute$/i })).toBeDisabled()
    expect(screen.queryByRole('button', { name: /preview request/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /start background run/i })).not.toBeInTheDocument()
    expect(executeCurlMock).not.toHaveBeenCalled()
  })

  it('hides Curl Executor async and batch controls when job flags are disabled', async () => {
    getConfigMock.mockResolvedValueOnce({
      config: {
        ...appConfig.config,
        features: {
          ...appConfig.config.features,
          curl_jobs: false,
          curl_batch: false,
          curl_cancel: false,
        },
      },
    })
    renderApp()

    fireEvent.click(screen.getByRole('button', { name: /curl executor/i }))

    expect(await screen.findByText(/batch execution is disabled by configuration/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /start background run/i })).not.toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /batch/i })).toBeDisabled()
    expect(screen.queryByRole('button', { name: /execute batch/i })).not.toBeInTheDocument()
  })

  it('gates Curl Executor batch controls independently from stop controls', async () => {
    getConfigMock.mockResolvedValueOnce({
      config: {
        ...appConfig.config,
        features: {
          ...appConfig.config.features,
          curl_jobs: true,
          curl_batch: false,
          curl_cancel: false,
        },
      },
    })
    renderApp()

    fireEvent.click(screen.getByRole('button', { name: /curl executor/i }))

    expect(await screen.findByText(/batch execution is disabled by configuration/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /start background run/i })).not.toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /batch/i })).toBeDisabled()
    expect(screen.queryByRole('button', { name: /stop/i })).not.toBeInTheDocument()
  })

  it('hides Curl Executor Stop while a batch job runs when cancellation is disabled', async () => {
    getConfigMock.mockResolvedValueOnce({
      config: {
        ...appConfig.config,
        features: {
          ...appConfig.config.features,
          curl_jobs: true,
          curl_batch: true,
          curl_cancel: false,
        },
      },
    })
    renderApp()

    fireEvent.click(screen.getByRole('button', { name: /curl executor/i }))
    await unlockCurlBatchMode()
    fireEvent.click(screen.getByRole('button', { name: /execute batch/i }))

    expect(await screen.findByLabelText(/curl job status/i)).toHaveTextContent('Running')
    expect(screen.queryByRole('button', { name: /stop/i })).not.toBeInTheDocument()
    expect(screen.getByText(/curl_cancel is disabled by configuration/i)).toBeInTheDocument()
  })

  it('continues Curl Executor polling after a transient poll error', async () => {
    getCurlJobResultsMock
      .mockResolvedValueOnce(curlJobSucceeded)
      .mockRejectedValueOnce({
        error_type: 'curl_poll_error',
        title: 'Curl poll failed',
        status: 503,
        detail: 'temporary poll failure',
        instance: null,
      })
      .mockResolvedValueOnce(curlJobSucceeded)
    renderApp()

    fireEvent.click(screen.getByRole('button', { name: /curl executor/i }))
    await unlockCurlBatchMode()
    vi.useFakeTimers()
    fireEvent.click(screen.getByRole('button', { name: /execute batch/i }))
    await act(async () => {
      await Promise.resolve()
    })

    expect(screen.getByLabelText(/curl job status/i)).toHaveTextContent('Running')
    const pollCallsBeforeBatchPoll = getCurlJobResultsMock.mock.calls.length

    await act(async () => {
      await vi.advanceTimersByTimeAsync(400)
    })
    expect(getCurlJobResultsMock).toHaveBeenCalledTimes(pollCallsBeforeBatchPoll + 1)
    expect(screen.getByRole('alert')).toHaveTextContent('temporary poll failure')
    expect(screen.getByLabelText(/curl job status/i)).toHaveTextContent('Running')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(400)
    })
    expect(getCurlJobResultsMock).toHaveBeenCalledTimes(pollCallsBeforeBatchPoll + 2)
    expect(screen.getByLabelText(/curl job status/i)).toHaveTextContent('Succeeded')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('starts a Curl Executor batch job and polls aggregate results', async () => {
    renderApp()

    fireEvent.click(screen.getByRole('button', { name: /curl executor/i }))
    await unlockCurlBatchMode()
    fireEvent.click(screen.getByRole('button', { name: /execute batch/i }))

    expect(await screen.findByLabelText(/curl job status/i)).toHaveTextContent('Running')
    expect(startCurlJobMock).toHaveBeenCalledWith({
      curls: [
        'curl https://api.example.com/users/1',
        'curl https://api.example.com/users/2',
      ],
      timeout_ms: null,
      follow_redirects: true,
      confirm_large_batch: false,
    })

    await waitFor(() => {
      expect(getCurlJobResultsMock).toHaveBeenCalledWith({ job_id: 'job-async-1' })
      expect(screen.getByLabelText(/curl job status/i)).toHaveTextContent('Succeeded')
      expect(screen.getByLabelText(/curl job status/i)).toHaveTextContent('1/1')
    })
    fireEvent.click(screen.getByRole('button', { name: /copy merged data/i }))
    await waitFor(() => {
      expect(writeClipboardTextMock).toHaveBeenCalledWith('[\n  {\n    "ok": true\n  }\n]')
    })
  })

  it('cancels a running Curl Executor job into terminal canceled state', async () => {
    getCurlJobResultsMock
      .mockResolvedValueOnce(curlJobSucceeded)
      .mockResolvedValueOnce(curlJobCanceledResults)
    renderApp()

    fireEvent.click(screen.getByRole('button', { name: /curl executor/i }))
    await unlockCurlBatchMode()
    fireEvent.click(screen.getByRole('button', { name: /execute batch/i }))

    expect(await screen.findByRole('button', { name: /stop/i })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: /stop/i }))

    await waitFor(() => {
      expect(cancelCurlJobMock).toHaveBeenCalledWith({ job_id: 'job-async-1' })
      expect(screen.getByLabelText(/curl job status/i)).toHaveTextContent('Canceled')
      expect(screen.getByLabelText(/curl job status/i)).toHaveTextContent('1/1')
    })
  })

  it('requires confirmation before starting a large curl batch and renders aggregate results', async () => {
    const batchStarted: CurlJobResponse = {
      job: { ...curlJobStarted.job, job_id: 'job-batch-1', total_requests: 20 },
    }
    const batchSucceeded: CurlJobResultsResponse = {
      job: {
        ...batchStarted.job,
        status: 'succeeded',
        completed_requests: 20,
        updated_at_utc: '2026-06-03T12:00:01Z',
      },
      results: [],
    }
    startCurlJobMock
      .mockResolvedValueOnce(curlJobStarted)
      .mockResolvedValueOnce(batchStarted)
    getCurlJobResultsMock
      .mockResolvedValueOnce(curlJobSucceeded)
      .mockResolvedValueOnce(batchSucceeded)
    renderApp()

    fireEvent.click(screen.getByRole('button', { name: /curl executor/i }))
    await unlockCurlBatchMode()
    fireEvent.change(screen.getByRole('textbox', { name: /batch curl commands/i }), {
      target: { value: Array.from({ length: 20 }, (_, index) => `curl https://api.example.com/users/${index + 1}`).join('\n') },
    })
    fireEvent.click(screen.getByRole('button', { name: /^execute batch$/i }))

    expect(screen.getByText(/large batch confirmation required/i)).toBeInTheDocument()
    expect(startCurlJobMock).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: /confirm and execute batch/i }))
    expect(startCurlJobMock).toHaveBeenLastCalledWith({
      curls: expect.arrayContaining(['curl https://api.example.com/users/1']),
      timeout_ms: null,
      follow_redirects: true,
      confirm_large_batch: true,
    })

    await waitFor(() => {
      expect(screen.getByLabelText(/curl job status/i)).toHaveTextContent('Succeeded')
      expect(screen.getByLabelText(/curl job status/i)).toHaveTextContent('20/20')
    })
  })

  it('renders Curl Executor command errors without showing a stale response', async () => {
    startCurlJobMock.mockRejectedValueOnce({
      error_type: 'invalid_request',
      title: 'Invalid request',
      status: 400,
      detail: 'curl guardrail URL cannot be empty',
      instance: null,
      invalid_params: [{ name: 'url', reason: 'curl guardrail URL cannot be empty' }],
    })
    renderApp()

    fireEvent.click(screen.getByRole('button', { name: /curl executor/i }))
    fireEvent.click(screen.getByRole('button', { name: /^execute$/i }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('curl guardrail URL cannot be empty')
    expect(screen.queryByLabelText(/curl execution response/i)).not.toBeInTheDocument()
  })

  it('shows Curl Executor execution parse errors and can navigate back to JSON Analyzer', async () => {
    startCurlJobMock.mockRejectedValueOnce({
      error_type: 'invalid_request',
      title: 'Invalid request',
      status: 400,
      detail: 'curl command must start with curl',
      instance: null,
      invalid_params: [{ name: 'curl', reason: 'curl command must start with curl' }],
    })
    renderApp()

    fireEvent.click(screen.getByRole('button', { name: /curl executor/i }))
    fireEvent.change(screen.getByRole('textbox', { name: /curl command input/i }), { target: { value: 'wget https://api.example.com' } })
    fireEvent.click(screen.getByRole('button', { name: /^execute$/i }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('curl command must start with curl')

    fireEvent.click(screen.getByRole('button', { name: /json analyzer/i }))
    expect(screen.getByRole('textbox', { name: /json input/i })).toBeInTheDocument()
  })
})
