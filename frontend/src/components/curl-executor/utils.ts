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

export function detectCurlPlaceholders(input: string): string[] {
  const placeholders = new Set<string>()
  const pattern = /\{[A-Za-z][A-Za-z0-9_-]*\}/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(input)) !== null) {
    placeholders.add(match[0])
  }
  return Array.from(placeholders).sort((left, right) => left.localeCompare(right))
}

export function buildBatchCurls(curl: string, placeholder: string, values: string[]): string[] {
  if (!placeholder || !curl.includes(placeholder)) {
    return []
  }
  return values.map((value) => curl.split(placeholder).join(value))
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

export interface BatchErrorGroup {
  message: string
  inputValues: string[]
}

export function buildBatchErrorGroups(results: CurlJobResultsResponse['results']): BatchErrorGroup[] {
  const groups = new Map<string, BatchErrorGroup>()
  for (const result of results) {
    if (!result.error) {
      continue
    }
    const message = result.error.detail || result.error.title || result.error.error_type
    const group = groups.get(message) ?? { message, inputValues: [] }
    group.inputValues.push(result.input_value?.trim() || `#${result.index + 1}`)
    groups.set(message, group)
  }
  return Array.from(groups.values())
}

function parseResponseBodyForCopy(body: string): unknown {
  try {
    return JSON.parse(body)
  } catch {
    return body
  }
}
