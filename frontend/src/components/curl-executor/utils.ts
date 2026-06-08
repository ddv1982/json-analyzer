import type {
  CurlJobResultsResponse,
  CurlJobStatus,
  CurlLimitsConfig,
  FeatureFlagsConfig,
  ProblemDetails,
} from '../../lib/commands'
import type { BadgeVariant } from '../common/Badge'

export type BatchTargetKind = 'placeholder' | 'path' | 'query'

export interface BatchTargetOption {
  id: string
  kind: BatchTargetKind
  placeholder: string
  label: string
  detail: string
  valuePreview: string
  pathIndex?: number
  queryIndex?: number
  queryName?: string
}

interface RawQueryParam {
  index: number
  nameRaw: string
  valueRaw: string
  hasEquals: boolean
  valueStart: number
  valueEnd: number
}

interface CurlToken {
  value: string
  start: number
  end: number
  valueStart: number
  valueEnd: number
  inlineValueStart?: number
  inlineValueEnd?: number
}

const SUPPORTED_CURL_VALUE_OPTIONS = new Set([
  '-A',
  '--user-agent',
  '-b',
  '--cookie',
  '-d',
  '--data',
  '--data-ascii',
  '--data-binary',
  '--data-raw',
  '--data-urlencode',
  '-H',
  '--header',
  '-u',
  '--user',
  '--user-name',
  '-X',
  '--request',
])

const SUPPORTED_CURL_FLAG_OPTIONS = new Set([
  '-G',
  '--get',
  '-I',
  '--head',
  '-L',
  '--location',
  '-S',
  '--show-error',
  '-i',
  '--include',
  '-k',
  '--insecure',
  '-s',
  '--silent',
  '--compressed',
])

const UNSUPPORTED_CURL_FILE_VALUE_OPTIONS = new Set([
  '-F',
  '--form',
  '--form-string',
  '-T',
  '--upload-file',
])

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

export function generateBatchExampleValues(valuePreview: string): string {
  const rawValue = valuePreview.trim()
  const decodedValue = decodePreview(rawValue.replace(/\+/g, ' '))
  const isEncoded = /%[0-9A-Fa-f]{2}|\+/.test(rawValue)
  const examples = examplesForValueShape(decodedValue)
  return examples
    .map((example) => (isEncoded ? encodeURIComponent(example) : example))
    .join('\n')
}

function examplesForValueShape(value: string): string[] {
  const trimmed = value.trim()
  if (isUuid(trimmed)) {
    return [
      '2f4c1f5a-1b7a-4a6d-8d76-4f5d4f2c8a91',
      '7c9e6679-7425-40de-944b-e07fc1f90ae7',
    ]
  }
  if (/^-?\d+$/.test(trimmed)) {
    const numericValue = Number(trimmed)
    if (Number.isSafeInteger(numericValue)) {
      return [String(numericValue + 1), String(numericValue + 2)]
    }
  }
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return ['user.one@example.com', 'user.two@example.com']
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return ['2026-01-15', '2026-01-16']
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/.test(trimmed)) {
    return ['2026-01-15T10:30:00Z', '2026-01-16T10:30:00Z']
  }
  if (/^[A-Za-z0-9_.-]{20,}$/.test(trimmed) || /^[A-Fa-f0-9]{16,}$/.test(trimmed)) {
    return ['token-alpha-001', 'token-beta-002']
  }
  if (/^[A-Za-z0-9]+(?:[-_][A-Za-z0-9]+)+$/.test(trimmed)) {
    return ['example-alpha', 'example-beta']
  }
  return ['value-001', 'value-002']
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
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

export function detectBatchTargetOptions(input: string): BatchTargetOption[] {
  const options: BatchTargetOption[] = detectCurlPlaceholders(input).map((placeholder) => ({
    id: `placeholder:${placeholder}`,
    kind: 'placeholder',
    placeholder,
    label: placeholder,
    detail: 'Existing placeholder',
    valuePreview: placeholder,
  }))
  const curlUrl = extractCurlUrl(input)
  if (!curlUrl) {
    return options
  }

  const parsedUrl = parseUrl(curlUrl.rawUrl)
  if (!parsedUrl) {
    return options
  }

  const pathSegments = parsedUrl.pathname.split('/').filter(Boolean)
  pathSegments.forEach((segment, index) => {
    if (segment.includes('{') || segment.includes('}')) {
      return
    }
    const previous = pathSegments[index - 1]
    const context = previous ? `after /${decodePreview(previous)}` : `segment ${index + 1}`
    options.push({
      id: `path:${index}:${segment}`,
      kind: 'path',
      placeholder: '{value}',
      label: `Path ${context}`,
      detail: `Replace ${decodePreview(segment)}`,
      valuePreview: segment,
      pathIndex: index,
    })
  })

  const queryParams = parseRawQueryParams(curlUrl.rawUrl)
  const queryNameCounts = queryParams.reduce<Map<string, number>>((counts, param) => {
    const displayName = displayQueryComponent(param.nameRaw)
    counts.set(displayName, (counts.get(displayName) ?? 0) + 1)
    return counts
  }, new Map())
  const queryNameOccurrences = new Map<string, number>()
  for (const param of queryParams) {
    if (param.valueRaw.includes('{') || param.valueRaw.includes('}')) {
      continue
    }
    const displayName = displayQueryComponent(param.nameRaw)
    const occurrence = (queryNameOccurrences.get(displayName) ?? 0) + 1
    queryNameOccurrences.set(displayName, occurrence)
    const duplicateSuffix = (queryNameCounts.get(displayName) ?? 0) > 1 ? ` #${occurrence}` : ''
    const placeholderName = sanitizePlaceholderName(displayName)
    options.push({
      id: `query:${param.index}`,
      kind: 'query',
      placeholder: `{${placeholderName}}`,
      label: `Query ${displayName}${duplicateSuffix}`,
      detail: param.hasEquals
        ? `Replace ${displayName}=${displayQueryComponent(param.valueRaw)}`
        : `Set ${displayName}`,
      valuePreview: param.valueRaw,
      queryIndex: param.index,
      queryName: displayName,
    })
  }

  return options
}

export function insertBatchTargetPlaceholder(
  input: string,
  target: BatchTargetOption,
  placeholder = target.placeholder,
): { curl: string; placeholder: string } {
  if (target.kind === 'placeholder') {
    return { curl: input, placeholder: target.placeholder }
  }

  const curlUrl = extractCurlUrl(input)
  if (!curlUrl) {
    return { curl: input, placeholder }
  }

  const nextRawUrl = target.kind === 'query'
    ? replaceQueryParamValue(curlUrl.rawUrl, target.queryIndex ?? -1, placeholder)
    : replacePathSegmentValue(curlUrl.rawUrl, target.pathIndex ?? -1, placeholder)

  if (nextRawUrl === curlUrl.rawUrl) {
    return { curl: input, placeholder }
  }

  return {
    curl: `${input.slice(0, curlUrl.start)}${nextRawUrl}${input.slice(curlUrl.end)}`,
    placeholder,
  }
}

export function buildBatchCurls(curl: string, placeholder: string, values: string[]): string[] {
  if (!placeholder || !curl.includes(placeholder)) {
    return []
  }
  return values.map((value) => curl.split(placeholder).join(value))
}

export function statusBadgeVariant(status: number): BadgeVariant {
  if (status >= 200 && status <= 299) {
    return 'success'
  }
  if (status >= 300 && status <= 399) {
    return 'warning'
  }
  if (status >= 400) {
    return 'danger'
  }
  return 'info'
}

export function isHttpErrorStatus(status: number): boolean {
  return status >= 400
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
    const message = result.error
      ? result.error.detail || result.error.title || result.error.error_type
      : result.response && isHttpErrorStatus(result.response.status)
        ? `${result.response.status} ${result.response.status_text ?? 'HTTP error'}`.trim()
        : null
    if (!message) {
      continue
    }
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

interface ExtractedCurlUrl {
  rawUrl: string
  start: number
  end: number
}

function extractCurlUrl(input: string): ExtractedCurlUrl | null {
  const tokens = tokenizeCurlWithSpans(input)
  if (tokens === null) {
    return null
  }
  if (tokens.length === 0) {
    return null
  }
  const command = tokens[0]?.value
  if (command !== 'curl' && !command?.endsWith('/curl') && !command?.endsWith('\\curl')) {
    return null
  }

  let requestUrl: ExtractedCurlUrl | null = null
  let urlCount = 0
  const recordUrl = (token: CurlToken | ExtractedCurlUrl): boolean => {
    urlCount += 1
    if (urlCount > 1) {
      return false
    }
    const extracted = 'rawUrl' in token ? token : extractedUrlFromToken(token)
    requestUrl = isHttpUrl(extracted.rawUrl) ? extracted : null
    return true
  }

  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index]
    if (token.value === '--') {
      for (const candidate of tokens.slice(index + 1)) {
        if (!recordUrl(candidate)) {
          return null
        }
      }
      break
    }

    const [option, inlineValue] = splitCurlOptionToken(token.value)
    if (option === '--url' && inlineValue !== null) {
      const value = token.value.slice('--url='.length)
      if (!recordUrl({
        rawUrl: value,
        start: token.inlineValueStart ?? token.valueStart + '--url='.length,
        end: token.inlineValueEnd ?? token.valueEnd,
      })) {
        return null
      }
      continue
    }

    if (option === '--url') {
      const nextToken = tokens[index + 1]
      if (!nextToken || !recordUrl(nextToken)) {
        return null
      }
      index += 1
      continue
    }

    if (token.value.startsWith('-') && token.value !== '-') {
      if (SUPPORTED_CURL_FLAG_OPTIONS.has(option)) {
        continue
      }
      if (UNSUPPORTED_CURL_FILE_VALUE_OPTIONS.has(option)) {
        return null
      }
      if (SUPPORTED_CURL_VALUE_OPTIONS.has(option)) {
        if (inlineValue === null) {
          index += 1
        }
        continue
      }
      return null
    }

    if (token.value.trim().length === 0 || !recordUrl(token)) {
      return null
    }
  }

  return requestUrl
}

function splitCurlOptionToken(token: string): [string, string | null] {
  if (token.startsWith('--')) {
    const equalsIndex = token.indexOf('=')
    if (equalsIndex > 0) {
      return [token.slice(0, equalsIndex), token.slice(equalsIndex + 1)]
    }
  }
  return [token, null]
}

function tokenizeCurlWithSpans(input: string): CurlToken[] | null {
  const tokens: CurlToken[] = []
  let index = 0

  while (index < input.length) {
    while (index < input.length) {
      if (/\s/.test(input[index])) {
        index += 1
        continue
      }
      if (input[index] === '\\' && input[index + 1] === '\n') {
        index += 2
        continue
      }
      if (input[index] === '\\' && input[index + 1] === '\r' && input[index + 2] === '\n') {
        index += 3
        continue
      }
      break
    }
    if (index >= input.length) {
      break
    }

    const start = index
    let value = ''
    let valueStart: number | null = null
    let valueEnd = index
    while (index < input.length && !/\s/.test(input[index])) {
      const character = input[index]
      if (character === "'" || character === '"') {
        const quote = character
        index += 1
        if (valueStart === null) {
          valueStart = index
        }
        while (index < input.length && input[index] !== quote) {
          if (quote === '"' && input[index] === '\\' && index + 1 < input.length) {
            index += 1
          }
          value += input[index]
          index += 1
        }
        if (index >= input.length) {
          return null
        }
        valueEnd = index
        index += 1
        continue
      }

      if (character === '\\' && index + 1 < input.length) {
        const nextCharacter = input[index + 1]
        if (nextCharacter === '\n') {
          index += 2
          continue
        }
        if (nextCharacter === '\r' && input[index + 2] === '\n') {
          index += 3
          continue
        }
        index += 1
      }
      if (valueStart === null) {
        valueStart = index
      }
      value += input[index]
      index += 1
      valueEnd = index
    }

    const token: CurlToken = {
      value,
      start,
      end: index,
      valueStart: valueStart ?? start,
      valueEnd,
    }
    const inlineSpan = findInlineLongOptionValueSpan(input, token)
    if (inlineSpan) {
      token.inlineValueStart = inlineSpan.start
      token.inlineValueEnd = inlineSpan.end
    }
    tokens.push(token)
  }

  return tokens
}

function findInlineLongOptionValueSpan(input: string, token: CurlToken): { start: number; end: number } | null {
  if (!token.value.startsWith('--')) {
    return null
  }
  const rawToken = input.slice(token.start, token.end)
  const equalsIndex = rawToken.indexOf('=')
  if (equalsIndex < 0) {
    return null
  }
  let valueStart = token.start + equalsIndex + 1
  let valueEnd = token.end
  const firstCharacter = input[valueStart]
  if ((firstCharacter === "'" || firstCharacter === '"') && input[token.end - 1] === firstCharacter) {
    valueStart += 1
    valueEnd -= 1
  }
  return { start: valueStart, end: valueEnd }
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value)
}

function extractedUrlFromToken(token: CurlToken): ExtractedCurlUrl {
  return {
    rawUrl: token.value,
    start: token.valueStart,
    end: token.valueEnd,
  }
}

function parseUrl(rawUrl: string): URL | null {
  try {
    return new URL(rawUrl)
  } catch {
    return null
  }
}

function replacePathSegmentValue(rawUrl: string, pathIndex: number, placeholder: string): string {
  const parsedUrl = parseUrl(rawUrl)
  if (!parsedUrl) {
    return rawUrl
  }
  const segments = parsedUrl.pathname.split('/')
  const nonEmptyIndexes = segments
    .map((segment, index) => (segment ? index : -1))
    .filter((index) => index >= 0)
  const segmentIndex = nonEmptyIndexes[pathIndex]
  if (segmentIndex === undefined) {
    return rawUrl
  }
  segments[segmentIndex] = placeholder
  const pathname = parsedUrl.pathname
  const nextPathname = segments.join('/')
  return rawUrl.replace(pathname, nextPathname)
}

function parseRawQueryParams(rawUrl: string): RawQueryParam[] {
  const fragmentStart = rawUrl.indexOf('#')
  const queryStart = rawUrl.indexOf('?')
  if (queryStart < 0 || (fragmentStart >= 0 && queryStart > fragmentStart)) {
    return []
  }
  const queryEnd = fragmentStart >= 0 ? fragmentStart : rawUrl.length
  const query = rawUrl.slice(queryStart + 1, queryEnd)
  if (!query) {
    return []
  }

  const params: RawQueryParam[] = []
  let segmentStart = queryStart + 1
  for (const segment of query.split('&')) {
    const segmentEnd = segmentStart + segment.length
    if (segment.length > 0) {
      const equalsIndex = segment.indexOf('=')
      const hasEquals = equalsIndex >= 0
      const nameRaw = hasEquals ? segment.slice(0, equalsIndex) : segment
      const valueRaw = hasEquals ? segment.slice(equalsIndex + 1) : ''
      const valueStart = hasEquals ? segmentStart + equalsIndex + 1 : segmentEnd
      params.push({
        index: params.length,
        nameRaw,
        valueRaw,
        hasEquals,
        valueStart,
        valueEnd: segmentEnd,
      })
    }
    segmentStart = segmentEnd + 1
  }
  return params
}

function replaceQueryParamValue(rawUrl: string, queryIndex: number, placeholder: string): string {
  const param = parseRawQueryParams(rawUrl).find((candidate) => candidate.index === queryIndex)
  if (!param) {
    return rawUrl
  }
  if (param.hasEquals) {
    return `${rawUrl.slice(0, param.valueStart)}${placeholder}${rawUrl.slice(param.valueEnd)}`
  }
  return `${rawUrl.slice(0, param.valueStart)}=${placeholder}${rawUrl.slice(param.valueEnd)}`
}

function sanitizePlaceholderName(name: string): string {
  const normalized = name.replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '')
  if (/^[A-Za-z]/.test(normalized)) {
    return normalized
  }
  return 'value'
}

function decodePreview(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function displayQueryComponent(value: string): string {
  return decodePreview(value.replace(/\+/g, ' '))
}
