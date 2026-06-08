import { useEffect, useMemo, useRef, useState } from 'react'
import {
  cancelCurlJob,
  executeCurl,
  getConfig,
  getCurlJobResults,
  normalizeCommandError,
  parseCurl,
  startCurlJob,
  type CurlExecuteResponse,
  type CurlJobResultsResponse,
  type CurlLimitsConfig,
  type FeatureFlagsConfig,
  type ProblemDetails,
} from '../../lib/commands'
import { Badge } from '../common/Badge'
import { Button } from '../common/Button'
import { DEFAULT_BATCH_PLACEHOLDER, DEFAULT_CURL_FEATURES, DEFAULT_CURL_LIMITS, SAMPLE_BATCH_VALUES, SAMPLE_CURL } from './constants'
import { CurlErrorPanel, CurlJobPanel, CurlResponsePanel } from './CurlExecutorPanels'
import type { BusyAction, CurlMode } from './types'
import {
  buildBatchCurls,
  detectCurlPlaceholders,
  disabledCurlGate,
  disabledCurlProblem,
  errorSignature,
  formatCurlFeatureStatus,
  isTerminalJobStatus,
  parseBatchLines,
  unsupportedFeatureProblem,
} from './utils'

export function CurlExecutorView() {
  const [mode, setMode] = useState<CurlMode>('single')
  const [curlInput, setCurlInput] = useState(SAMPLE_CURL)
  const [batchInput, setBatchInput] = useState(SAMPLE_BATCH_VALUES)
  const [batchPlaceholder, setBatchPlaceholder] = useState(DEFAULT_BATCH_PLACEHOLDER)
  const [batchPreview, setBatchPreview] = useState<string | null>(null)
  const [batchPreviewError, setBatchPreviewError] = useState<string | null>(null)
  const [executionResult, setExecutionResult] = useState<CurlExecuteResponse | null>(null)
  const [jobResults, setJobResults] = useState<CurlJobResultsResponse | null>(null)
  const [error, setError] = useState<ProblemDetails | null>(null)
  const [busyAction, setBusyAction] = useState<BusyAction>(null)
  const [curlLimits, setCurlLimits] = useState<CurlLimitsConfig>(DEFAULT_CURL_LIMITS)
  const [curlFeatures, setCurlFeatures] = useState<FeatureFlagsConfig>(DEFAULT_CURL_FEATURES)
  const [requestTimeoutMs, setRequestTimeoutMs] = useState(DEFAULT_CURL_LIMITS.default_timeout_ms)
  const [maxConcurrency, setMaxConcurrency] = useState(DEFAULT_CURL_LIMITS.default_max_concurrency)
  const [largeBatchConfirmationPending, setLargeBatchConfirmationPending] = useState(false)
  const [jobMode, setJobMode] = useState<CurlMode | null>(null)
  const pollErrorSignatureRef = useRef<string | null>(null)
  const detectedPlaceholders = useMemo(() => detectCurlPlaceholders(curlInput), [curlInput])
  const batchValues = useMemo(() => parseBatchLines(batchInput), [batchInput])
  const generatedBatchCurls = useMemo(
    () => buildBatchCurls(curlInput, batchPlaceholder, batchValues),
    [batchPlaceholder, batchValues, curlInput],
  )
  const hasSelectedBatchPlaceholder = curlInput.includes(batchPlaceholder)
  const hasInput = mode === 'single'
    ? curlInput.trim().length > 0
    : curlInput.trim().length > 0 && batchValues.length > 0
  const hasAnyInput = curlInput.trim().length > 0 || batchInput.trim().length > 0
  const canExecuteBatchSetup =
    mode === 'batch' &&
    hasInput &&
    hasSelectedBatchPlaceholder &&
    generatedBatchCurls.length > 0 &&
    generatedBatchCurls.length <= curlLimits.max_batch_size &&
    batchPreview !== null &&
    batchPreviewError === null
  const isBusy = busyAction !== null
  const isJobActive = jobResults ? !isTerminalJobStatus(jobResults.job.status) : false
  const isCurlAvailable = curlLimits.enabled && curlFeatures.curl_executor
  const canExecuteSingleRequest = isCurlAvailable && curlFeatures.curl_single_request_execution
  const canStartJobs = isCurlAvailable && curlFeatures.curl_jobs
  const canUseBatch = canStartJobs && curlFeatures.curl_batch
  const canCancelJobs = canStartJobs && curlFeatures.curl_cancel
  const canEnterBatchMode = canUseBatch
  const singleJobResult = jobMode === 'single' && jobResults && isTerminalJobStatus(jobResults.job.status)
    ? jobResults.results[0]
    : null
  const singleJobResponse = singleJobResult?.response ?? null
  const shouldShowJobPanel = jobResults
    ? jobMode !== 'single' || !isTerminalJobStatus(jobResults.job.status) || !singleJobResponse
    : false

  useEffect(() => {
    let canceled = false
    getConfig()
      .then((response) => {
        if (!canceled) {
          setCurlLimits(response.config.limits.curl)
          setCurlFeatures(response.config.features)
          setRequestTimeoutMs(response.config.limits.curl.default_timeout_ms)
          setMaxConcurrency(response.config.limits.curl.default_max_concurrency)
        }
      })
      .catch(() => {
        // Defaults keep the UI usable in tests or mock-only contexts.
      })
    return () => {
      canceled = true
    }
  }, [])

  useEffect(() => {
    if (mode === 'batch' && !canEnterBatchMode) {
      setMode('single')
      setLargeBatchConfirmationPending(false)
    }
  }, [canEnterBatchMode, mode])

  useEffect(() => {
    if (detectedPlaceholders.includes(batchPlaceholder)) {
      return
    }
    setBatchPlaceholder(detectedPlaceholders[0] ?? DEFAULT_BATCH_PLACEHOLDER)
  }, [batchPlaceholder, detectedPlaceholders])

  useEffect(() => {
    if (mode !== 'batch' || generatedBatchCurls.length === 0) {
      setBatchPreview(null)
      setBatchPreviewError(null)
      return undefined
    }

    let canceled = false
    parseCurl({ curl: generatedBatchCurls[0] })
      .then((preview) => {
        if (!canceled) {
          setBatchPreview(`${preview.parsed.method} ${preview.parsed.url}`)
          setBatchPreviewError(null)
        }
      })
      .catch((unknownError) => {
        if (!canceled) {
          setBatchPreview(null)
          const normalizedError = normalizeCommandError(unknownError)
          setBatchPreviewError(normalizedError.detail)
        }
      })

    return () => {
      canceled = true
    }
  }, [generatedBatchCurls, mode])

  useEffect(() => {
    if (!jobResults || isTerminalJobStatus(jobResults.job.status)) {
      return undefined
    }

    let canceled = false
    let timeout: number | undefined
    const jobId = jobResults.job.job_id

    const schedulePoll = () => {
      timeout = window.setTimeout(() => {
        getCurlJobResults({ job_id: jobId })
          .then((results) => {
            if (canceled) {
              return
            }
            setJobResults(results)
            if (pollErrorSignatureRef.current) {
              const pollErrorSignature = pollErrorSignatureRef.current
              pollErrorSignatureRef.current = null
              setError((current) => current && errorSignature(current) === pollErrorSignature ? null : current)
            }
            if (!isTerminalJobStatus(results.job.status)) {
              schedulePoll()
            }
          })
          .catch((unknownError) => {
            if (canceled) {
              return
            }
            const normalizedError = normalizeCommandError(unknownError)
            const nextSignature = errorSignature(normalizedError)
            pollErrorSignatureRef.current = nextSignature
            setError((current) => errorSignature(current) === nextSignature ? current : normalizedError)
            schedulePoll()
          })
      }, 400)
    }

    schedulePoll()

    return () => {
      canceled = true
      if (timeout !== undefined) {
        window.clearTimeout(timeout)
      }
    }
  }, [jobResults?.job.job_id, jobResults?.job.status])

  async function handleExecute() {
    if (!canExecuteSingleRequest) {
      const disabledGate = disabledCurlGate(curlLimits, curlFeatures) ?? 'features.curl_single_request_execution'
      setError(unsupportedFeatureProblem(disabledGate, 'single curl request execution is disabled by configuration'))
      return
    }

    setBusyAction('execute')
    setExecutionResult(null)
    setJobResults(null)
    setError(null)
    setJobMode(null)

    try {
      const result = await executeCurl({
        curl: curlInput,
        timeout_ms: requestTimeoutMs,
        follow_redirects: true,
      })
      setExecutionResult(result)
    } catch (unknownError) {
      setExecutionResult(null)
      setError(normalizeCommandError(unknownError))
    } finally {
      setBusyAction(null)
    }
  }

  async function handleStartBatchJob() {
    if (!canUseBatch) {
      setError(disabledCurlProblem(curlLimits, curlFeatures, 'curl batch execution is disabled by configuration', 'features.curl_batch'))
      return
    }
    if (!hasSelectedBatchPlaceholder) {
      setError({
        error_type: 'invalid_request',
        title: 'Invalid batch setup',
        status: 400,
        detail: `Curl command must include the selected placeholder ${batchPlaceholder}.`,
        instance: null,
        invalid_params: [{ name: 'placeholder', reason: 'selected placeholder is not present in the curl command' }],
      })
      return
    }
    if (batchValues.length === 0) {
      setError({
        error_type: 'invalid_request',
        title: 'Invalid batch setup',
        status: 400,
        detail: 'Batch values cannot be empty.',
        instance: null,
        invalid_params: [{ name: 'values', reason: 'provide one or more batch values' }],
      })
      return
    }
    if (generatedBatchCurls.length > curlLimits.max_batch_size) {
      setError({
        error_type: 'invalid_request',
        title: 'Invalid batch setup',
        status: 400,
        detail: `Batch cannot include more than ${curlLimits.max_batch_size} requests.`,
        instance: null,
        invalid_params: [{ name: 'values', reason: `too many values; max ${curlLimits.max_batch_size}` }],
      })
      return
    }
    if (batchPreviewError || !batchPreview) {
      setError({
        error_type: 'invalid_request',
        title: 'Invalid batch setup',
        status: 400,
        detail: batchPreviewError ?? 'Generated curl preview is not available yet.',
        instance: null,
        invalid_params: [{ name: 'curl', reason: 'generated curl preview must parse before execution' }],
      })
      return
    }
    const needsConfirmation = generatedBatchCurls.length >= curlLimits.large_batch_confirmation_threshold
    if (needsConfirmation && !largeBatchConfirmationPending) {
      setLargeBatchConfirmationPending(true)
      setError(null)
      return
    }
    await startJob(needsConfirmation, 'batch')
  }

  async function startJob(confirmLargeBatch: boolean, nextJobMode: CurlMode) {
    if (!canStartJobs) {
      setError(disabledCurlProblem(curlLimits, curlFeatures, 'curl batch execution is disabled by configuration', 'features.curl_jobs'))
      return
    }
    if (nextJobMode === 'batch' && !canUseBatch) {
      setError(disabledCurlProblem(curlLimits, curlFeatures, 'curl batch execution is disabled by configuration', 'features.curl_batch'))
      return
    }

    setBusyAction('start-job')
    setExecutionResult(null)
    setJobResults(null)
    setError(null)
    setJobMode(nextJobMode)

    try {
      const response = await startCurlJob({
        curl: curlInput,
        placeholder: nextJobMode === 'batch' ? batchPlaceholder : null,
        values: nextJobMode === 'batch' ? batchValues : [],
        timeout_ms: requestTimeoutMs,
        max_concurrency: maxConcurrency,
        follow_redirects: true,
        confirm_large_batch: confirmLargeBatch,
      })
      setJobResults({ job: response.job, results: [] })
      setLargeBatchConfirmationPending(false)
    } catch (unknownError) {
      setError(normalizeCommandError(unknownError))
    } finally {
      setBusyAction(null)
    }
  }

  async function handleCancelJob() {
    if (!jobResults || isTerminalJobStatus(jobResults.job.status)) {
      return
    }
    if (!canCancelJobs) {
      setError(disabledCurlProblem(curlLimits, curlFeatures, 'curl job cancellation is disabled by configuration', 'features.curl_cancel'))
      return
    }

    setBusyAction('cancel-job')
    setError(null)
    try {
      const canceled = await cancelCurlJob({ job_id: jobResults.job.job_id })
      setJobResults((current) => current ? { ...current, job: canceled.job } : { job: canceled.job, results: [] })
      const results = await getCurlJobResults({ job_id: canceled.job.job_id })
      setJobResults(results)
    } catch (unknownError) {
      setError(normalizeCommandError(unknownError))
    } finally {
      setBusyAction(null)
    }
  }

  function handleClear() {
    setCurlInput('')
    setBatchInput('')
    setBatchPlaceholder(DEFAULT_BATCH_PLACEHOLDER)
    setBatchPreview(null)
    setBatchPreviewError(null)
    setExecutionResult(null)
    setJobResults(null)
    setError(null)
    setJobMode(null)
    setLargeBatchConfirmationPending(false)
  }

  function handleModeChange(nextMode: CurlMode) {
    setMode(nextMode)
    setExecutionResult(null)
    setJobResults(null)
    setError(null)
    setJobMode(null)
    setLargeBatchConfirmationPending(false)
    setBatchPreviewError(null)
  }

  return (
    <section className="curl-executor" aria-label="Curl Executor task flow">
      <section className="panel curl-instructions-panel" aria-labelledby="curl-how-to-use-title">
        <div className="panel-heading">
          <div>
            <p className="section-kicker">Instructions</p>
            <h2 id="curl-how-to-use-title">How to use</h2>
          </div>
          <Badge variant={isCurlAvailable && canStartJobs && canUseBatch ? 'success' : 'warning'}>
            {formatCurlFeatureStatus(isCurlAvailable, canExecuteSingleRequest, canStartJobs, canUseBatch, canCancelJobs)}
          </Badge>
        </div>

        <div className="curl-instructions-grid">
          <section className="curl-instruction-card" aria-labelledby="single-request-steps">
            <h3 id="single-request-steps">For single requests</h3>
            <ol>
              <li><span>1</span>In Postman, choose the Code button for your request.</li>
              <li><span>2</span>Select cURL and copy the full command.</li>
              <li><span>3</span>Paste it below, then choose Execute.</li>
            </ol>
          </section>
          <section className="curl-instruction-card" aria-labelledby="batch-request-steps">
            <h3 id="batch-request-steps">For batch requests</h3>
            <ol>
              <li><span>1</span>Add a placeholder such as {DEFAULT_BATCH_PLACEHOLDER} to the curl command.</li>
              <li><span>2</span>Switch to Batch mode and choose the batch variable.</li>
              <li><span>3</span>Paste values, preview the generated request, then choose Execute Batch.</li>
            </ol>
          </section>
        </div>

        <section className="state-card success-state" aria-label="Curl security note">
          <strong>Secure execution</strong>
          <span>Authorization, cookies, and API-key-like headers are redacted in displayed request and response details.</span>
        </section>
      </section>

      <section className="panel curl-command-panel" aria-labelledby="curl-command-title">
        <div className="panel-heading">
          <div>
            <p className="section-kicker">Curl Command</p>
            <h2 id="curl-command-title">Paste your curl command from Postman here</h2>
          </div>
        </div>

        <fieldset className="mode-toggle" disabled={isBusy || isJobActive}>
          <legend className="control-label">Request type</legend>
          <label>
            <input
              type="radio"
              name="curl-mode"
              value="single"
              checked={mode === 'single'}
              onChange={() => handleModeChange('single')}
            />
            Single request
          </label>
          <label>
            <input
              type="radio"
              name="curl-mode"
              value="batch"
              checked={mode === 'batch'}
              onChange={() => handleModeChange('batch')}
              disabled={!canEnterBatchMode}
            />
            Batch mode{canEnterBatchMode ? '' : ' (disabled)'}
          </label>
        </fieldset>

        {!curlLimits.enabled ? (
          <p className="muted">Curl execution is disabled by configuration.</p>
        ) : !curlFeatures.curl_executor ? (
          <p className="muted">Curl Executor is disabled by configuration.</p>
        ) : !canStartJobs ? (
          <p className="muted">Batch execution is disabled by configuration.</p>
        ) : !canUseBatch ? (
          <p className="muted">Batch execution is disabled by configuration.</p>
        ) : null}
        {isCurlAvailable && !canExecuteSingleRequest ? (
          <p className="muted">Single request execution is disabled by configuration.</p>
        ) : null}
        <label className="control-label" htmlFor="curl-input">
          Curl command input
        </label>
        <textarea
          id="curl-input"
          aria-label="Curl command input"
          className="curl-textarea"
          value={curlInput}
          onChange={(event) => {
            setCurlInput(event.target.value)
            setExecutionResult(null)
            setJobResults(null)
            setError(null)
            setJobMode(null)
            setLargeBatchConfirmationPending(false)
            setBatchPreview(null)
            setBatchPreviewError(null)
          }}
          placeholder="curl --location 'https://api.example.com/endpoint' --header 'Authorization: Bearer token'"
          disabled={isBusy || isJobActive}
        />

        {mode === 'batch' ? (
          <>
            {detectedPlaceholders.length > 0 ? (
              <>
                <label className="control-label" htmlFor="curl-batch-placeholder">
                  Batch variable
                </label>
                <select
                  id="curl-batch-placeholder"
                  value={batchPlaceholder}
                  onChange={(event) => {
                    setBatchPlaceholder(event.target.value)
                    setBatchPreview(null)
                    setBatchPreviewError(null)
                    setJobResults(null)
                    setError(null)
                    setLargeBatchConfirmationPending(false)
                  }}
                  disabled={isBusy || isJobActive}
                >
                  {detectedPlaceholders.map((placeholder) => (
                    <option key={placeholder} value={placeholder}>{placeholder}</option>
                  ))}
                </select>
              </>
            ) : (
              <section className="state-card warning-state" role="status">
                <strong>Insert placeholder</strong>
                <span>Add a placeholder such as {DEFAULT_BATCH_PLACEHOLDER} anywhere in the curl command above, then select it before running a batch.</span>
              </section>
            )}
            <label className="control-label" htmlFor="curl-batch-input">
              Batch values
            </label>
            <textarea
              id="curl-batch-input"
              aria-label="Batch values"
              className="curl-textarea batch-textarea"
              value={batchInput}
              onChange={(event) => {
                setBatchInput(event.target.value)
                setBatchPreview(null)
                setBatchPreviewError(null)
                setJobResults(null)
                setError(null)
                setLargeBatchConfirmationPending(false)
              }}
              placeholder="One value per line"
              disabled={isBusy || isJobActive}
            />
            <p className="muted">
              {batchValues.length} value{batchValues.length === 1 ? '' : 's'} detected. Max {curlLimits.max_batch_size}; confirmation at {curlLimits.large_batch_confirmation_threshold}+.
            </p>
            <div className="curl-batch-controls">
              <label className="control-label" htmlFor="curl-timeout-ms">
                Request timeout: {Math.round(requestTimeoutMs / 1000)}s
              </label>
              <input
                id="curl-timeout-ms"
                type="range"
                min={5_000}
                max={curlLimits.max_timeout_ms}
                step={5_000}
                value={requestTimeoutMs}
                onChange={(event) => setRequestTimeoutMs(Number(event.target.value))}
                disabled={isBusy || isJobActive}
              />
              <label className="control-label" htmlFor="curl-max-concurrency">
                Concurrent requests: {maxConcurrency}
              </label>
              <input
                id="curl-max-concurrency"
                type="range"
                min={1}
                max={curlLimits.max_concurrency}
                step={1}
                value={maxConcurrency}
                onChange={(event) => setMaxConcurrency(Number(event.target.value))}
                disabled={isBusy || isJobActive}
              />
            </div>
            {generatedBatchCurls.length > 0 && curlInput.includes(batchPlaceholder) ? (
              <section className="state-card info-state" role="status">
                <strong>Batch preview</strong>
                <span>{generatedBatchCurls.length} request{generatedBatchCurls.length === 1 ? '' : 's'} will replace {batchPlaceholder}. Sample: {batchPreview ?? 'Preview unavailable until the generated curl parses.'}</span>
                <span>Raw replacement is exact. Use already-encoded values for URL path or query placeholders.</span>
              </section>
            ) : null}
            {batchPreviewError ? (
              <section className="state-card warning-state" role="status">
                <strong>Preview error</strong>
                <span>{batchPreviewError}</span>
              </section>
            ) : null}
          </>
        ) : null}

        <div className="action-row curl-action-row">
          {mode === 'single' ? (
            <Button variant="primary" onClick={handleExecute} disabled={!hasInput || isBusy || isJobActive || !canExecuteSingleRequest}>
              {busyAction === 'execute' ? 'Executing...' : 'Execute'}
            </Button>
          ) : canEnterBatchMode ? (
            <Button variant="primary" onClick={() => void handleStartBatchJob()} disabled={!canExecuteBatchSetup || isBusy || isJobActive}>
              {busyAction === 'start-job'
                ? 'Executing Batch...'
                : largeBatchConfirmationPending
                  ? 'Confirm and Execute Batch'
                  : 'Execute Batch'}
            </Button>
          ) : null}
          <Button onClick={handleClear} disabled={!hasAnyInput || isBusy || isJobActive}>
            Clear
          </Button>
          {jobResults && !isTerminalJobStatus(jobResults.job.status) && canCancelJobs ? (
            <Button variant="danger" onClick={() => void handleCancelJob()} disabled={isBusy}>
              {busyAction === 'cancel-job' ? 'Stopping...' : 'Stop'}
            </Button>
          ) : null}
        </div>
      </section>

      {jobResults && !isTerminalJobStatus(jobResults.job.status) && !canCancelJobs ? (
        <section className="state-card warning-state" role="status">
          <strong>Job cancellation disabled</strong>
          <span>curl_cancel is disabled by configuration; this run will continue polling until it reaches a terminal state.</span>
        </section>
      ) : null}

      {largeBatchConfirmationPending ? (
        <section className="state-card warning-state" role="status">
          <strong>Large batch confirmation required</strong>
          <span>{generatedBatchCurls.length} requests meet or exceed the configured threshold. Review the batch, then choose Confirm and Execute Batch.</span>
        </section>
      ) : null}

      {jobResults && shouldShowJobPanel ? <CurlJobPanel jobResults={jobResults} mode={jobMode ?? mode} /> : null}
      {error ? <CurlErrorPanel error={error} /> : null}
      {singleJobResult?.request_preview && singleJobResponse ? (
        <CurlResponsePanel exchange={{ request_preview: singleJobResult.request_preview, response: singleJobResponse }} />
      ) : null}
      {executionResult?.response ? (
        <CurlResponsePanel exchange={{ request_preview: executionResult.request_preview, response: executionResult.response }} />
      ) : null}
    </section>
  )
}
