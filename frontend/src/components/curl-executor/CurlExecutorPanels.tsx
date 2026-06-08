import type { CurlHttpResponse, CurlJobResultsResponse, ParsedCurlPreview, ProblemDetails } from '../../lib/commands'
import { useClipboardCopy } from '../../lib/clipboard'
import { Badge } from '../common/Badge'
import { CopyButton } from '../common/CopyButton'
import type { CurlMode } from './types'
import {
  buildBatchErrorGroups,
  buildMergedJobDataPayload,
  formatJobResult,
  formatJobStatus,
  jobStatusBadgeVariant,
} from './utils'

interface CurlResponseExchange {
  request_preview: ParsedCurlPreview
  response: CurlHttpResponse
}

export function CurlResponsePanel({ exchange }: { exchange: CurlResponseExchange }) {
  const { copiedKey, errorKey, errorMessage, copy } = useClipboardCopy(1800)
  const { request_preview: requestPreview, response } = exchange

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
        <dt>Request</dt>
        <dd>{requestPreview.method} {requestPreview.url}</dd>
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

export function CurlJobPanel({ jobResults, mode }: { jobResults: CurlJobResultsResponse; mode: CurlMode }) {
  const { job, results } = jobResults
  const { copiedKey, errorKey, errorMessage, copy } = useClipboardCopy(1800)
  const mergedDataPayload = mode === 'batch' ? buildMergedJobDataPayload(results) : null
  const errorGroups = mode === 'batch' ? buildBatchErrorGroups(results) : []
  const progressPercent = job.total_requests > 0
    ? Math.round(((job.completed_requests + job.failed_requests + job.canceled_requests) / job.total_requests) * 100)
    : 0

  return (
    <section className="result-card curl-job-panel" aria-label="Curl job status">
      <div className="result-card-heading">
        <div>
          <p className="section-kicker">Progress</p>
          <h3>{mode === 'batch' ? 'Batch Response' : 'Execution'} {job.job_id}</h3>
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
      {errorGroups.length > 0 ? (
        <section className="curl-error-groups" aria-label="Curl batch errors">
          <h4>Errors</h4>
          <table>
            <thead>
              <tr>
                <th>Message</th>
                <th>Input value</th>
              </tr>
            </thead>
            <tbody>
              {errorGroups.map((group) => (
                <tr key={group.message}>
                  <td>{group.message}</td>
                  <td>{group.inputValues.map((value) => <code key={value}>{value}</code>)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
      {results.length > 0 ? (
        <table aria-label="Curl job results">
          <thead>
            <tr>
              <th>#</th>
              {mode === 'batch' ? <th>Input value</th> : null}
              <th>Status</th>
              <th>Request</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>
            {results.map((result) => (
              <tr key={result.index}>
                <td>{result.index + 1}</td>
                {mode === 'batch' ? <td>{result.input_value ? <code>{result.input_value}</code> : 'None'}</td> : null}
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

export function CurlErrorPanel({ error }: { error: ProblemDetails }) {
  const { copiedKey, errorKey, errorMessage, copy } = useClipboardCopy(1800)
  const details = JSON.stringify(error, null, 2)

  return (
    <section className="state-card error-state" role="alert">
      <div className="result-card-heading">
        <strong>{error.title}</strong>
        <CopyButton
          state={copiedKey === 'curl-error-details' ? 'copied' : errorKey === 'curl-error-details' ? 'error' : 'idle'}
          label="Copy Details"
          onClick={() => void copy(details, 'curl-error-details')}
        />
      </div>
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
      {errorMessage ? <p className="input-help warning-text" role="status">{errorMessage}</p> : null}
    </section>
  )
}
