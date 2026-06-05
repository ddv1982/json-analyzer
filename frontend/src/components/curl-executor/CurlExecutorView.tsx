import { useEffect, useMemo, useRef, useState } from 'react'
import {
  cancelCurlJob,
  executeCurl,
  getConfig,
  getCurlJobResults,
  normalizeCommandError,
  startCurlJob,
  type CurlExecuteResponse,
  type CurlHttpResponse,
  type CurlJobResultsResponse,
  type CurlJobStatus,
  type CurlLimitsConfig,
  type FeatureFlagsConfig,
  type ProblemDetails,
} from '../../lib/commands'
import { useClipboardCopy } from '../../lib/clipboard'
import { Badge, type BadgeVariant } from '../common/Badge'
import { Button } from '../common/Button'
import { CopyButton } from '../common/CopyButton'

const SAMPLE_CURL = `curl -X POST https://api.example.com/users \\
  -H 'Authorization: Bearer example-token' \\
  -H 'Content-Type: application/json' \\
  --data '{"name":"Alice"}'`

const SAMPLE_BATCH = `curl https://api.example.com/users/1
curl https://api.example.com/users/2`

const DEFAULT_CURL_LIMITS: CurlLimitsConfig = {
  enabled: true,
  default_timeout_ms: 30_000,
  max_timeout_ms: 120_000,
  max_response_bytes: 1_048_576,
  max_batch_size: 100,
  large_batch_confirmation_threshold: 20,
  allow_private_networks_by_default: false,
}

const DEFAULT_CURL_FEATURES: FeatureFlagsConfig = {
  values_explorer: true,
  advanced_duplicates: true,
  pdf_export: false,
  curl_executor: true,
  curl_single_request_execution: true,
  curl_jobs: true,
  curl_batch: true,
  curl_cancel: true,
  metrics_ui: false,
  http_openapi_adapter: false,
  sqlite_curl_jobs: false,
}

type BusyAction = 'execute' | 'start-job' | 'cancel-job' | null
type CurlMode = 'single' | 'batch'

export function CurlExecutorView() {
  const [mode, setMode] = useState<CurlMode>('single')
  const [curlInput, setCurlInput] = useState(SAMPLE_CURL)
  const [batchInput, setBatchInput] = useState(SAMPLE_BATCH)
  const [executionResult, setExecutionResult] = useState<CurlExecuteResponse | null>(null)
  const [jobResults, setJobResults] = useState<CurlJobResultsResponse | null>(null)
  const [error, setError] = useState<ProblemDetails | null>(null)
  const [busyAction, setBusyAction] = useState<BusyAction>(null)
  const [curlLimits, setCurlLimits] = useState<CurlLimitsConfig>(DEFAULT_CURL_LIMITS)
  const [curlFeatures, setCurlFeatures] = useState<FeatureFlagsConfig>(DEFAULT_CURL_FEATURES)
  const [largeBatchConfirmationPending, setLargeBatchConfirmationPending] = useState(false)
  const [hasSuccessfulSingleRequest, setHasSuccessfulSingleRequest] = useState(false)
  const [bearerTokenDetected, setBearerTokenDetected] = useState(false)
  const [jobMode, setJobMode] = useState<CurlMode | null>(null)
  const pollErrorSignatureRef = useRef<string | null>(null)
  const batchCurls = useMemo(() => parseBatchLines(batchInput), [batchInput])
  const hasInput = mode === 'single' ? curlInput.length > 0 : batchCurls.length > 0
  const isBusy = busyAction !== null
  const isJobActive = jobResults ? !isTerminalJobStatus(jobResults.job.status) : false
  const isCurlAvailable = curlLimits.enabled && curlFeatures.curl_executor
  const canExecuteSingleRequest = isCurlAvailable && curlFeatures.curl_single_request_execution
  const canStartJobs = isCurlAvailable && curlFeatures.curl_jobs
  const canUseBatch = canStartJobs && curlFeatures.curl_batch
  const canCancelJobs = canStartJobs && curlFeatures.curl_cancel
  const canEnterBatchMode = canUseBatch && hasSuccessfulSingleRequest && bearerTokenDetected
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
    if (!singleJobResult || singleJobResult.status !== 'succeeded') {
      return
    }
    setHasSuccessfulSingleRequest(true)
    setBearerTokenDetected(singleJobResult.request_preview?.auth.bearer_token_present ?? false)
  }, [singleJobResult])

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
      if (canStartJobs) {
        await startJob([curlInput], false, 'single')
        return
      }

      const result = await executeCurl({
        curl: curlInput,
        timeout_ms: null,
        follow_redirects: true,
      })
      setExecutionResult(result)
      if (result.response) {
        setHasSuccessfulSingleRequest(true)
        setBearerTokenDetected(result.request_preview.auth.bearer_token_present)
      }
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
    if (!canEnterBatchMode) {
      setError(disabledCurlProblem(curlLimits, curlFeatures, 'batch mode requires a successful single request with a bearer token', 'features.curl_batch'))
      return
    }
    const needsConfirmation = batchCurls.length >= curlLimits.large_batch_confirmation_threshold
    if (needsConfirmation && !largeBatchConfirmationPending) {
      setLargeBatchConfirmationPending(true)
      setError(null)
      return
    }
    await startJob(batchCurls, needsConfirmation, 'batch')
  }

  async function startJob(curls: string[], confirmLargeBatch: boolean, nextJobMode: CurlMode) {
    if (!canStartJobs) {
      setError(disabledCurlProblem(curlLimits, curlFeatures, 'curl batch execution is disabled by configuration', 'features.curl_jobs'))
      return
    }
    if (curls.length > 1 && !canUseBatch) {
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
        curls,
        timeout_ms: null,
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
    setExecutionResult(null)
    setJobResults(null)
    setError(null)
    setJobMode(null)
    setLargeBatchConfirmationPending(false)
    setHasSuccessfulSingleRequest(false)
    setBearerTokenDetected(false)
  }

  function handleModeChange(nextMode: CurlMode) {
    setMode(nextMode)
    setExecutionResult(null)
    setJobResults(null)
    setError(null)
    setJobMode(null)
    setLargeBatchConfirmationPending(false)
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
              <li><span>1</span>Switch to Batch mode and paste one curl command per line.</li>
              <li><span>2</span>Review the request count and any large-batch confirmation.</li>
              <li><span>3</span>Choose Execute Batch and track progress until every request finishes.</li>
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
        {canUseBatch && !canEnterBatchMode ? (
          <p className="muted">Batch mode requires a successful single request with a bearer token.</p>
        ) : null}

        {mode === 'single' ? (
          <>
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
                setHasSuccessfulSingleRequest(false)
                setBearerTokenDetected(false)
              }}
              placeholder="curl --location 'https://api.example.com/endpoint' --header 'Authorization: Bearer token'"
              disabled={isBusy || isJobActive}
            />
          </>
        ) : (
          <>
            <label className="control-label" htmlFor="curl-batch-input">
              Batch curl commands
            </label>
            <textarea
              id="curl-batch-input"
              aria-label="Batch curl commands"
              className="curl-textarea batch-textarea"
              value={batchInput}
              onChange={(event) => {
                setBatchInput(event.target.value)
                setJobResults(null)
                setError(null)
                setLargeBatchConfirmationPending(false)
              }}
              placeholder="One curl command per non-empty line"
              disabled={isBusy || isJobActive}
            />
            <p className="muted">
              {batchCurls.length} request{batchCurls.length === 1 ? '' : 's'} detected. Max {curlLimits.max_batch_size}; confirmation at {curlLimits.large_batch_confirmation_threshold}+.
            </p>
          </>
        )}

        <div className="action-row curl-action-row">
          {mode === 'single' ? (
            <Button variant="primary" onClick={handleExecute} disabled={!hasInput || isBusy || isJobActive || !canExecuteSingleRequest}>
              {busyAction === 'execute' ? 'Executing...' : 'Execute'}
            </Button>
          ) : canEnterBatchMode ? (
            <Button variant="primary" onClick={() => void handleStartBatchJob()} disabled={!hasInput || isBusy || isJobActive || batchCurls.length > curlLimits.max_batch_size}>
              {busyAction === 'start-job'
                ? 'Executing Batch...'
                : largeBatchConfirmationPending
                  ? 'Confirm and Execute Batch'
                  : 'Execute Batch'}
            </Button>
          ) : null}
          <Button onClick={handleClear} disabled={!hasInput || isBusy || isJobActive}>
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
          <span>{batchCurls.length} requests meet or exceed the configured threshold. Review the batch, then choose Confirm and Execute Batch.</span>
        </section>
      ) : null}

      {jobResults && shouldShowJobPanel ? <CurlJobPanel jobResults={jobResults} mode={jobMode ?? mode} /> : null}
      {error ? <CurlErrorPanel error={error} /> : null}
      {singleJobResponse ? <CurlResponsePanel response={singleJobResponse} /> : null}
      {executionResult?.response ? <CurlResponsePanel response={executionResult.response} /> : null}
    </section>
  )
}

function CurlResponsePanel({ response }: { response: CurlHttpResponse }) {
  const { copiedKey, errorKey, errorMessage, copy } = useClipboardCopy(1800)

  return (
    <section className="result-card" aria-label="Curl execution response">
      <div className="result-card-heading">
        <h3>Response</h3>
        <div className="inline-action-group">
          <Badge variant="success">
            {response.status} {response.status_text ?? ''}
          </Badge>
          <CopyButton
            state={copiedKey === 'curl-response' ? 'copied' : errorKey === 'curl-response' ? 'error' : 'idle'}
            label="Copy Response"
            onClick={() => void copy(response.body, 'curl-response')}
          />
        </div>
      </div>
      <dl className="key-detail-list">
        <dt>Elapsed</dt>
        <dd>{response.elapsed_ms} ms</dd>
        <dt>Response size</dt>
        <dd>{response.response_bytes.toLocaleString()} bytes</dd>
        <dt>Body preview</dt>
        <dd>{response.body_truncated ? 'Truncated to configured limit' : 'Complete within limit'}</dd>
      </dl>
      <h4>Response headers</h4>
      {response.headers.length > 0 ? (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Preview value</th>
              <th>Safety</th>
            </tr>
          </thead>
          <tbody>
            {response.headers.map((header) => (
              <tr key={`${header.name}:${header.value}`}>
                <td>{header.name}</td>
                <td><code>{header.value}</code></td>
                <td>{header.redacted ? 'Redacted' : 'Visible'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="muted">No response headers captured.</p>
      )}
      <h4>Body preview</h4>
      {response.body.length > 0 ? <pre className="preview-code">{response.body}</pre> : <p className="muted">Response body is empty.</p>}
      {errorMessage ? <p className="input-help warning-text" role="status">{errorMessage}</p> : null}
    </section>
  )
}

function CurlJobPanel({ jobResults, mode }: { jobResults: CurlJobResultsResponse; mode: CurlMode }) {
  const { job, results } = jobResults
  const { copiedKey, errorKey, errorMessage, copy } = useClipboardCopy(1800)
  const mergedDataPayload = mode === 'batch' ? buildMergedJobDataPayload(results) : null
  const progressPercent = job.total_requests > 0
    ? Math.round(((job.completed_requests + job.failed_requests + job.canceled_requests) / job.total_requests) * 100)
    : 0

  return (
    <section className="result-card curl-job-panel" aria-label="Curl job status">
      <div className="result-card-heading">
        <div>
          <p className="section-kicker">Progress</p>
          <h3>{mode === 'batch' ? 'Batch execution' : 'Execution'} {job.job_id}</h3>
        </div>
        <div className="inline-action-group">
          {mergedDataPayload ? (
            <CopyButton
              state={copiedKey === 'curl-merged-data' ? 'copied' : errorKey === 'curl-merged-data' ? 'error' : 'idle'}
              label="Copy Merged Data"
              onClick={() => void copy(mergedDataPayload, 'curl-merged-data')}
            />
          ) : null}
          <Badge variant={jobStatusBadgeVariant(job.status)}>{formatJobStatus(job.status)}</Badge>
        </div>
      </div>
      <dl className="key-detail-list">
        <dt>Progress</dt>
        <dd>{progressPercent}% ({job.completed_requests + job.failed_requests + job.canceled_requests}/{job.total_requests})</dd>
        <dt>Succeeded</dt>
        <dd>{job.completed_requests}</dd>
        <dt>Failed</dt>
        <dd>{job.failed_requests}</dd>
        <dt>Canceled</dt>
        <dd>{job.canceled_requests}</dd>
      </dl>
      <progress value={progressPercent} max={100} aria-label="Curl job progress" />
      {results.length > 0 ? (
        <table aria-label="Curl job results">
          <thead>
            <tr>
              <th>#</th>
              <th>Status</th>
              <th>Request</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>
            {results.map((result) => (
              <tr key={result.index}>
                <td>{result.index + 1}</td>
                <td>{formatJobStatus(result.status)}</td>
                <td>{result.request_preview ? `${result.request_preview.method} ${result.request_preview.url}` : 'Not parsed'}</td>
                <td>{formatJobResult(result)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="muted">Waiting for first poll results…</p>
      )}
      {errorMessage ? <p className="input-help warning-text" role="status">{errorMessage}</p> : null}
    </section>
  )
}

function CurlErrorPanel({ error }: { error: ProblemDetails }) {
  return (
    <section className="state-card error-state" role="alert">
      <strong>{error.title}</strong>
      <span>{error.detail}</span>
      {error.invalid_params?.length ? (
        <ul>
          {error.invalid_params.map((param) => (
            <li key={`${param.name}:${param.reason}`}>
              {param.name}: {param.reason}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}

function formatCurlFeatureStatus(
  isCurlAvailable: boolean,
  canExecuteSingleRequest: boolean,
  canStartJobs: boolean,
  canUseBatch: boolean,
  canCancelJobs: boolean,
): string {
  if (!isCurlAvailable) {
    return 'Curl disabled'
  }
  if (!canExecuteSingleRequest && !canStartJobs) {
    return 'Curl actions disabled'
  }
  if (!canStartJobs) {
    return 'Batch disabled'
  }
  if (canUseBatch && canCancelJobs) {
    return 'Batch available'
  }
  const disabled = [
    canExecuteSingleRequest ? null : 'execute',
    canUseBatch ? null : 'batch',
    canCancelJobs ? null : 'stop',
  ].filter(Boolean)
  return `${disabled.join(' + ')} disabled`
}

function disabledCurlProblem(
  limits: CurlLimitsConfig,
  features: FeatureFlagsConfig,
  detail: string,
  fallbackName = 'features.curl_executor',
): ProblemDetails {
  return unsupportedFeatureProblem(disabledCurlGate(limits, features) ?? fallbackName, detail)
}

function disabledCurlGate(limits: CurlLimitsConfig, features: FeatureFlagsConfig): string | null {
  if (!limits.enabled) {
    return 'limits.curl.enabled'
  }
  if (!features.curl_executor) {
    return 'features.curl_executor'
  }
  return null
}

function errorSignature(error: ProblemDetails | null): string | null {
  return error ? `${error.error_type}:${error.detail}` : null
}

function unsupportedFeatureProblem(name: string, detail: string): ProblemDetails {
  return {
    error_type: 'unsupported_config',
    title: 'Unsupported configuration',
    status: 501,
    detail,
    instance: null,
    invalid_params: [{ name, reason: detail }],
  }
}

function parseBatchLines(input: string): string[] {
  return input
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

function isTerminalJobStatus(status: CurlJobStatus): boolean {
  return status === 'succeeded' || status === 'failed' || status === 'canceled'
}

function formatJobStatus(status: CurlJobStatus): string {
  switch (status) {
    case 'queued':
      return 'Queued'
    case 'running':
      return 'Running'
    case 'succeeded':
      return 'Succeeded'
    case 'failed':
      return 'Failed'
    case 'canceled':
      return 'Canceled'
  }
}

function jobStatusBadgeVariant(status: CurlJobStatus): BadgeVariant {
  if (status === 'succeeded') {
    return 'success'
  }
  if (status === 'failed') {
    return 'danger'
  }
  if (status === 'canceled') {
    return 'warning'
  }
  return 'info'
}

function formatJobResult(result: CurlJobResultsResponse['results'][number]): string {
  if (result.response) {
    return `${result.response.status} ${result.response.status_text ?? ''}`.trim()
  }
  if (result.error) {
    return result.error.detail
  }
  return 'Pending'
}

function buildMergedJobDataPayload(results: CurlJobResultsResponse['results']): string | null {
  const bodies = results
    .filter((result) => result.status === 'succeeded' && result.response?.body !== undefined)
    .map((result) => parseResponseBodyForCopy(result.response?.body ?? ''))

  if (bodies.length === 0) {
    return null
  }

  return JSON.stringify(bodies, null, 2)
}

function parseResponseBodyForCopy(body: string): unknown {
  try {
    return JSON.parse(body)
  } catch {
    return body
  }
}
