import type {
  CurlJobResultsResponse,
  CurlJobStatus,
  CurlLimitsConfig,
  FeatureFlagsConfig,
  ProblemDetails,
} from '../../lib/commands'
import type { BadgeVariant } from '../common/Badge'

export function formatCurlFeatureStatus(
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

export function disabledCurlProblem(
  limits: CurlLimitsConfig,
  features: FeatureFlagsConfig,
  detail: string,
  fallbackName = 'features.curl_executor',
): ProblemDetails {
  return unsupportedFeatureProblem(disabledCurlGate(limits, features) ?? fallbackName, detail)
}

export function disabledCurlGate(limits: CurlLimitsConfig, features: FeatureFlagsConfig): string | null {
  if (!limits.enabled) {
    return 'limits.curl.enabled'
  }
  if (!features.curl_executor) {
    return 'features.curl_executor'
  }
  return null
}

export function errorSignature(error: ProblemDetails | null): string | null {
  return error ? `${error.error_type}:${error.detail}` : null
}

export function unsupportedFeatureProblem(name: string, detail: string): ProblemDetails {
  return {
    error_type: 'unsupported_config',
    title: 'Unsupported configuration',
    status: 501,
    detail,
    instance: null,
    invalid_params: [{ name, reason: detail }],
  }
}

export function parseBatchLines(input: string): string[] {
  return input
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

export function isTerminalJobStatus(status: CurlJobStatus): boolean {
  return status === 'succeeded' || status === 'failed' || status === 'canceled'
}

export function formatJobStatus(status: CurlJobStatus): string {
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

export function jobStatusBadgeVariant(status: CurlJobStatus): BadgeVariant {
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

export function formatJobResult(result: CurlJobResultsResponse['results'][number]): string {
  if (result.response) {
    return `${result.response.status} ${result.response.status_text ?? ''}`.trim()
  }
  if (result.error) {
    return result.error.detail
  }
  return 'Pending'
}

export function buildMergedJobDataPayload(results: CurlJobResultsResponse['results']): string | null {
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
