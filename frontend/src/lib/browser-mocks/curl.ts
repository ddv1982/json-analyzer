import type {
  CurlExecuteRequest,
  CurlExecuteResponse,
  CurlGuardrailRequest,
  CurlGuardrailResponse,
  CurlHeader,
  CurlJobRequest,
  CurlJobResponse,
  CurlJobResultsResponse,
  CurlJobResult,
  CurlJobStatus,
  CurlParseRequest,
  CurlParseResponse,
  CurlStartJobRequest,
  ProblemDetails,
} from '../commands'
import { mockConfig } from './config'
import { problem } from './problem'

const mockCurlJobs = new Map<string, CurlJobResultsResponse>()
let mockCurlJobSequence = 0

export function mockParseCurl(request: CurlParseRequest): CurlParseResponse {
  const tokens = tokenizeCurl(request.curl)
  if (tokens.length === 0) {
    throw problem('invalid_request', 'Invalid request', 'curl command cannot be empty')
  }
  if (tokens[0] !== 'curl' && !tokens[0].endsWith('/curl') && !tokens[0].endsWith('\\curl')) {
    throw problem('invalid_request', 'Invalid request', 'curl command must start with curl')
  }

  const headers: CurlHeader[] = []
  const bodyParts: string[] = []
  const supportedOptions: string[] = []
  const warnings: string[] = []
  let method: string | null = null
  let url: string | null = null
  let explicitGet = false
  let head = false
  let bearerTokenPresent = false
  let authScheme: string | null = null

  for (let index = 1; index < tokens.length;) {
    const token = tokens[index]
    if (!token) {
      index += 1
      continue
    }

    if (token.startsWith('-') && token !== '-') {
      const [option, inlineValue] = splitCurlOption(token)
      const readValue = () => {
        if (inlineValue !== null) {
          return { value: inlineValue, nextIndex: index + 1 }
        }
        const value = tokens[index + 1]
        if (value === undefined) {
          throw problem('invalid_request', 'Invalid request', `curl option ${option} requires a value`)
        }
        return { value, nextIndex: index + 2 }
      }

      switch (option) {
        case '-X':
        case '--request': {
          const { value, nextIndex } = readValue()
          method = value.trim().toUpperCase()
          supportedOptions.push('-X')
          index = nextIndex
          break
        }
        case '-H':
        case '--header': {
          const { value, nextIndex } = readValue()
          const header = parseMockCurlHeader(value)
          headers.push(header)
          if (header.name.toLowerCase() === 'authorization') {
            authScheme = header.value.split(/\s+/)[0] || null
            bearerTokenPresent = header.redacted && /^bearer$/i.test(authScheme ?? '')
          }
          supportedOptions.push('-H')
          index = nextIndex
          break
        }
        case '--url': {
          const { value, nextIndex } = readValue()
          url = setSingleMockUrl(url, value)
          supportedOptions.push('--url')
          index = nextIndex
          break
        }
        case '-d':
        case '--data':
        case '--data-raw':
        case '--data-binary':
        case '--data-ascii':
        case '--data-urlencode': {
          const { value, nextIndex } = readValue()
          if (value.startsWith('@') || (option === '--data-urlencode' && /(^|[^=])@/.test(value))) {
            throw problem('invalid_request', 'Invalid request', `file-backed curl data values are not supported for ${option}`)
          }
          bodyParts.push(value)
          supportedOptions.push(option === '-d' ? '--data' : option)
          index = nextIndex
          break
        }
        case '-u':
        case '--user':
        case '--user-name': {
          const { nextIndex } = readValue()
          headers.push({ name: 'Authorization', value: 'Basic ***', redacted: true })
          authScheme ??= 'Basic'
          supportedOptions.push('-u')
          index = nextIndex
          break
        }
        case '-b':
        case '--cookie': {
          const { nextIndex } = readValue()
          headers.push({ name: 'Cookie', value: '***', redacted: true })
          supportedOptions.push('-b')
          index = nextIndex
          break
        }
        case '-A':
        case '--user-agent': {
          const { value, nextIndex } = readValue()
          headers.push({ name: 'User-Agent', value, redacted: false })
          supportedOptions.push('-A')
          index = nextIndex
          break
        }
        case '-G':
        case '--get':
          explicitGet = true
          supportedOptions.push('-G')
          index += 1
          break
        case '-I':
        case '--head':
          head = true
          supportedOptions.push('-I')
          index += 1
          break
        case '-L':
        case '--location':
          warnings.push('redirect following is parsed for preview only and is not executed')
          supportedOptions.push('-L')
          index += 1
          break
        case '-k':
        case '--insecure':
          warnings.push('TLS verification options are ignored by parse-only preview')
          supportedOptions.push('-k')
          index += 1
          break
        case '-s':
        case '--silent':
        case '-S':
        case '--show-error':
        case '-i':
        case '--include':
        case '--compressed':
          supportedOptions.push(option)
          index += 1
          break
        case '-F':
        case '--form':
        case '--form-string':
        case '-T':
        case '--upload-file':
          throw problem('unsupported_file_upload_option', 'Unsupported curl file upload option', `unsupported file upload option ${option}`)
        default:
          throw problem('invalid_request', 'Invalid request', `unsupported curl option ${option}`)
      }
      continue
    }

    url = setSingleMockUrl(url, token)
    index += 1
  }

  if (!url) {
    throw problem('invalid_request', 'Invalid request', 'curl command must include a URL')
  }

  const joinedBody = bodyParts.length > 0 ? bodyParts.join('&') : null
  let previewUrl = url
  if (explicitGet && joinedBody) {
    previewUrl += `${previewUrl.includes('?') ? '&' : '?'}${joinedBody}`
  }
  const previewBody = explicitGet ? null : joinedBody

  return {
    parsed: {
      method: method ?? (head ? 'HEAD' : previewBody !== null ? 'POST' : 'GET'),
      url: previewUrl,
      headers,
      body: previewBody,
      body_kind: previewBody === null ? null : inferMockCurlBodyKind(previewBody, headers),
      auth: { bearer_token_present: bearerTokenPresent, scheme: authScheme },
      supported_options: normalizeMockSupportedOptions(supportedOptions),
      warnings,
    },
  }
}

export function mockExecuteCurl(request: CurlExecuteRequest): CurlExecuteResponse {
  const parsed = mockParseCurl({ curl: request.curl }).parsed
  const guardrail = mockValidateCurlGuardrail({
    method: parsed.method,
    url: parsed.url,
    redirect_target: null,
  }).decision
  if (!guardrail.allowed) {
    throw problem('curl_guardrail_denied', 'Curl request blocked', guardrail.reason)
  }
  if ((request.timeout_ms ?? 30_000) <= 1) {
    throw problem('curl_timeout', 'Curl request timed out', `Curl request timed out after ${request.timeout_ms ?? 1} ms`)
  }
  return {
    request_preview: parsed,
    guardrail,
    response: mockCurlHttpResponse(),
  }
}

export function mockStartCurlJob(request: CurlStartJobRequest): CurlJobResponse {
  const config = mockConfig()
  if (request.curls.length === 0) {
    throw problem('invalid_request', 'Invalid request', 'curl job must include at least one request')
  }
  if (request.curls.length > config.limits.curl.max_batch_size) {
    throw problem('invalid_request', 'Invalid request', `curl batch cannot include more than ${config.limits.curl.max_batch_size} requests`)
  }
  if (
    request.curls.length > 1 &&
    request.curls.length >= config.limits.curl.large_batch_confirmation_threshold &&
    !request.confirm_large_batch
  ) {
    throw problem('invalid_request', 'Invalid request', `curl batch of ${request.curls.length} requests requires confirmation`)
  }

  const jobId = `browser-curl-job-${++mockCurlJobSequence}`
  const now = new Date().toISOString()
  const job: CurlJobResultsResponse = {
    job: {
      job_id: jobId,
      status: 'running',
      total_requests: request.curls.length,
      completed_requests: 0,
      failed_requests: 0,
      canceled_requests: 0,
      created_at_utc: now,
      updated_at_utc: now,
    },
    results: request.curls.map((curl, index) => ({
      index,
      status: index === 0 ? 'running' : 'queued',
      request_preview: safeMockCurlPreview(curl),
      response: null,
      error: null,
    })),
  }
  mockCurlJobs.set(jobId, job)
  return { job: job.job }
}

export function mockGetCurlJobResults(request: CurlJobRequest): CurlJobResultsResponse {
  const job = getMockCurlJob(request.job_id)
  if (isMockCurlJobTerminal(job.job.status)) {
    return cloneMockCurlJob(job)
  }

  job.results = job.results.map((result) => {
    if (result.status === 'succeeded' || result.status === 'failed' || result.status === 'canceled') {
      return result
    }
    return buildMockCurlJobResult(result)
  })
  job.job.completed_requests = job.results.filter((result) => result.status === 'succeeded').length
  job.job.failed_requests = job.results.filter((result) => result.status === 'failed').length
  job.job.canceled_requests = job.results.filter((result) => result.status === 'canceled').length
  job.job.status = job.job.failed_requests > 0 ? 'failed' : 'succeeded'
  job.job.updated_at_utc = new Date().toISOString()
  return cloneMockCurlJob(job)
}

export function mockCancelCurlJob(request: CurlJobRequest): CurlJobResponse {
  const job = getMockCurlJob(request.job_id)
  if (!isMockCurlJobTerminal(job.job.status)) {
    job.results = job.results.map((result) =>
      result.status === 'succeeded' || result.status === 'failed'
        ? result
        : { ...result, status: 'canceled', response: null, error: null },
    )
    job.job.status = 'canceled'
    job.job.completed_requests = job.results.filter((result) => result.status === 'succeeded').length
    job.job.failed_requests = job.results.filter((result) => result.status === 'failed').length
    job.job.canceled_requests = job.results.filter((result) => result.status === 'canceled').length
    job.job.updated_at_utc = new Date().toISOString()
  }
  return { job: { ...job.job } }
}

function buildMockCurlJobResult(result: CurlJobResult): CurlJobResult {
  const preview = result.request_preview
  if (!preview) {
    return { ...result, status: 'failed', error: toSerializableProblem(problem('invalid_request', 'Invalid request', 'curl command must include a URL')) }
  }
  const guardrail = mockGuardrailDecision(preview.url)
  if (!guardrail.allowed) {
    return {
      ...result,
      status: 'failed',
      response: null,
      error: toSerializableProblem(problem('curl_guardrail_denied', 'Curl request blocked', guardrail.reason)),
    }
  }
  return { ...result, status: 'succeeded', response: mockCurlHttpResponse(), error: null }
}

function safeMockCurlPreview(curl: string): CurlJobResult['request_preview'] {
  try {
    return mockParseCurl({ curl }).parsed
  } catch {
    return null
  }
}

function mockCurlHttpResponse(): CurlExecuteResponse['response'] {
  return {
    status: 200,
    status_text: 'OK',
    headers: [
      { name: 'Content-Type', value: 'application/json', redacted: false },
      { name: 'Set-Cookie', value: '***', redacted: true },
    ],
    body: '{"ok":true}',
    body_truncated: false,
    elapsed_ms: 12,
    response_bytes: 11,
  }
}

function getMockCurlJob(jobId: string): CurlJobResultsResponse {
  const job = mockCurlJobs.get(jobId)
  if (!job) {
    throw problem('invalid_request', 'Invalid request', 'curl job not found')
  }
  return job
}

function cloneMockCurlJob(job: CurlJobResultsResponse): CurlJobResultsResponse {
  return JSON.parse(JSON.stringify(job)) as CurlJobResultsResponse
}

function isMockCurlJobTerminal(status: CurlJobStatus): boolean {
  return status === 'succeeded' || status === 'failed' || status === 'canceled'
}

function toSerializableProblem(error: ProblemDetails): NonNullable<CurlJobResult['error']> {
  return {
    error_type: error.error_type,
    title: error.title,
    status: error.status ?? 500,
    detail: error.detail,
    invalid_params: error.invalid_params ?? [],
  }
}

export function mockValidateCurlGuardrail(request: CurlGuardrailRequest): CurlGuardrailResponse {
  const method = request.method.trim()
  if (method.length === 0) {
    throw problem('invalid_request', 'Invalid request', 'curl guardrail method cannot be empty')
  }
  if (!isValidMockHttpMethod(method)) {
    throw problem('invalid_request', 'Invalid request', 'curl guardrail method is invalid')
  }
  if (request.url.trim().length === 0) {
    throw problem('invalid_request', 'Invalid request', 'curl guardrail URL cannot be empty')
  }
  if (request.redirect_target !== undefined && request.redirect_target !== null && request.redirect_target.trim().length === 0) {
    throw problem('invalid_request', 'Invalid request', 'curl guardrail redirect target cannot be empty')
  }

  return { decision: mockGuardrailDecision(request.redirect_target?.trim() ?? request.url) }
}

function mockGuardrailDecision(url: string): CurlGuardrailResponse['decision'] {
  try {
    const parsedUrl = new URL(url)
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return { allowed: false, reason: 'only_http_and_https_schemes_are_supported', error_type: 'curl_guardrail_denied' }
    }
    const host = normalizeMockGuardrailHost(parsedUrl.hostname)
    if (isMockLocalhostName(host)) {
      return { allowed: false, reason: 'localhost_targets_are_blocked_by_default', error_type: 'curl_guardrail_denied' }
    }
    const ipAddress = parseMockIpAddress(host)
    if (ipAddress && isBlockedMockIpAddress(ipAddress)) {
      return { allowed: false, reason: 'private_network_targets_are_blocked_by_default', error_type: 'curl_guardrail_denied' }
    }
    return { allowed: true, reason: parsedUrl.protocol === 'https:' ? 'public_https_url' : 'public_http_url', error_type: null }
  } catch {
    return { allowed: false, reason: 'url_is_not_parseable', error_type: 'curl_guardrail_denied' }
  }
}

function isValidMockHttpMethod(method: string): boolean {
  return /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(method)
}

function normalizeMockGuardrailHost(hostname: string): string {
  const withoutIpv6Brackets = hostname.startsWith('[') && hostname.endsWith(']')
    ? hostname.slice(1, -1)
    : hostname
  return withoutIpv6Brackets.toLowerCase().replace(/\.+$/, '')
}

function isMockLocalhostName(host: string): boolean {
  return host === 'localhost' || host.endsWith('.localhost')
}

interface MockIpv4Address {
  kind: 'ipv4'
  parts: [number, number, number, number]
}

interface MockIpv6Address {
  kind: 'ipv6'
  parts: number[]
  mappedIpv4: MockIpv4Address | null
}

type MockIpAddress = MockIpv4Address | MockIpv6Address

function parseMockIpAddress(host: string): MockIpAddress | null {
  const ipv4 = parseMockIpv4Address(host)
  if (ipv4) {
    return ipv4
  }
  return parseMockIpv6Address(host)
}

function parseMockIpv4Address(host: string): MockIpv4Address | null {
  const segments = host.split('.')
  if (segments.length !== 4) {
    return null
  }
  const parts = segments.map((segment) => {
    if (!/^\d{1,3}$/.test(segment)) {
      return Number.NaN
    }
    const value = Number(segment)
    return value >= 0 && value <= 255 ? value : Number.NaN
  })
  if (parts.some(Number.isNaN)) {
    return null
  }
  return { kind: 'ipv4', parts: parts as [number, number, number, number] }
}

function parseMockIpv6Address(host: string): MockIpv6Address | null {
  if (!host.includes(':')) {
    return null
  }

  const zoneIndex = host.indexOf('%')
  const address = zoneIndex >= 0 ? host.slice(0, zoneIndex) : host
  const pieces = address.split('::')
  if (pieces.length > 2) {
    return null
  }

  const head = parseMockIpv6Pieces(pieces[0] ?? '')
  const tail = parseMockIpv6Pieces(pieces[1] ?? '')
  if (!head || !tail) {
    return null
  }

  const compression = pieces.length === 2
  const missingGroups = 8 - head.groups.length - tail.groups.length
  if ((!compression && missingGroups !== 0) || (compression && missingGroups < 1)) {
    return null
  }

  const parts = compression
    ? [...head.groups, ...Array.from({ length: missingGroups }, () => 0), ...tail.groups]
    : [...head.groups, ...tail.groups]
  if (parts.length !== 8) {
    return null
  }

  return { kind: 'ipv6', parts, mappedIpv4: head.mappedIpv4 ?? tail.mappedIpv4 ?? mappedMockIpv4FromIpv6Parts(parts) }
}

function mappedMockIpv4FromIpv6Parts(parts: number[]): MockIpv4Address | null {
  const isMapped = parts.slice(0, 5).every((part) => part === 0) && parts[5] === 0xffff
  if (!isMapped) {
    return null
  }
  return {
    kind: 'ipv4',
    parts: [parts[6] >> 8, parts[6] & 0xff, parts[7] >> 8, parts[7] & 0xff],
  }
}

function parseMockIpv6Pieces(piece: string): { groups: number[]; mappedIpv4: MockIpv4Address | null } | null {
  if (piece.length === 0) {
    return { groups: [], mappedIpv4: null }
  }

  const rawGroups = piece.split(':')
  const groups: number[] = []
  let mappedIpv4: MockIpv4Address | null = null

  for (const [index, rawGroup] of rawGroups.entries()) {
    if (rawGroup.length === 0) {
      return null
    }
    if (rawGroup.includes('.')) {
      if (index !== rawGroups.length - 1) {
        return null
      }
      mappedIpv4 = parseMockIpv4Address(rawGroup)
      if (!mappedIpv4) {
        return null
      }
      groups.push((mappedIpv4.parts[0] << 8) | mappedIpv4.parts[1], (mappedIpv4.parts[2] << 8) | mappedIpv4.parts[3])
      continue
    }
    if (!/^[0-9a-f]{1,4}$/i.test(rawGroup)) {
      return null
    }
    groups.push(Number.parseInt(rawGroup, 16))
  }

  return { groups, mappedIpv4 }
}

function isBlockedMockIpAddress(ipAddress: MockIpAddress): boolean {
  if (ipAddress.kind === 'ipv4') {
    return isBlockedMockIpv4Address(ipAddress)
  }
  if (ipAddress.mappedIpv4 && isBlockedMockIpv4Address(ipAddress.mappedIpv4)) {
    return true
  }
  return isBlockedMockIpv6Address(ipAddress)
}

function isBlockedMockIpv4Address({ parts }: MockIpv4Address): boolean {
  const [first, second, third, fourth] = parts
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 0 && third === 0) ||
    (first === 192 && second === 0 && third === 2) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    (first === 198 && second === 51 && third === 100) ||
    (first === 203 && second === 0 && third === 113) ||
    first >= 224 ||
    (first === 255 && second === 255 && third === 255 && fourth === 255)
  )
}

function isBlockedMockIpv6Address({ parts }: MockIpv6Address): boolean {
  return (
    parts.every((part) => part === 0) ||
    parts.slice(0, 7).every((part) => part === 0) && parts[7] === 1 ||
    (parts[0] & 0xfe00) === 0xfc00 ||
    (parts[0] & 0xffc0) === 0xfe80 ||
    parts[0] === 0x2001 && parts[1] === 0x0db8 ||
    (parts[0] & 0xff00) === 0xff00
  )
}

function tokenizeCurl(input: string): string[] {
  const tokens: string[] = []
  let current = ''
  let quote: 'single' | 'double' | null = null
  let tokenStarted = false

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index]
    if (quote === 'single') {
      tokenStarted = true
      if (char === "'") {
        quote = null
      } else {
        current += char
      }
      continue
    }
    if (quote === 'double') {
      tokenStarted = true
      if (char === '"') {
        quote = null
      } else if (char === '\\') {
        const next = input[index + 1]
        if (next !== undefined) {
          current += next
          index += 1
        }
      } else {
        current += char
      }
      continue
    }

    if (char === "'") {
      tokenStarted = true
      quote = 'single'
    } else if (char === '"') {
      tokenStarted = true
      quote = 'double'
    } else if (char === '\\' && (input[index + 1] === '\n' || input[index + 1] === '\r')) {
      index += input[index + 1] === '\r' && input[index + 2] === '\n' ? 2 : 1
    } else if (/\s/.test(char)) {
      if (tokenStarted) {
        tokens.push(current)
        current = ''
        tokenStarted = false
      }
    } else if (char === '\\') {
      tokenStarted = true
      const next = input[index + 1]
      if (next !== undefined) {
        current += next
        index += 1
      } else {
        current += char
      }
    } else {
      tokenStarted = true
      current += char
    }
  }

  if (quote !== null) {
    throw problem('invalid_request', 'Invalid request', 'curl command contains an unterminated quote')
  }
  if (tokenStarted) {
    tokens.push(current)
  }
  return tokens
}

function splitCurlOption(token: string): [string, string | null] {
  if (token.startsWith('--') && token.includes('=')) {
    const [option, ...rest] = token.split('=')
    return [option, rest.join('=')]
  }
  return [token, null]
}

function parseMockCurlHeader(value: string): CurlHeader {
  const separator = value.indexOf(':')
  if (separator < 0) {
    throw problem('invalid_request', 'Invalid request', "curl header must use 'Name: value' syntax")
  }
  const name = value.slice(0, separator).trim()
  const rawValue = value.slice(separator + 1).trim()
  if (!name) {
    throw problem('invalid_request', 'Invalid request', 'curl header name cannot be empty')
  }

  const sensitiveHeaders = [
    'authorization',
    'proxy-authorization',
    'cookie',
    'set-cookie',
    'api-key',
    'apikey',
    'x-api-key',
    'x-auth-token',
    'x-access-token',
    'private-token',
    'x-csrf-token',
    'x-xsrf-token',
  ]
  const sensitive = sensitiveHeaders.includes(name.toLowerCase())
  if (!sensitive) {
    return { name, value: rawValue, redacted: false }
  }
  if (name.toLowerCase() === 'authorization' || name.toLowerCase() === 'proxy-authorization') {
    const scheme = rawValue.split(/\s+/)[0]
    return { name, value: `${scheme || 'Authorization'} ***`, redacted: true }
  }
  return { name, value: '***', redacted: true }
}

function setSingleMockUrl(currentUrl: string | null, nextUrl: string): string {
  if (!nextUrl.trim()) {
    throw problem('invalid_request', 'Invalid request', 'curl URL cannot be empty')
  }
  if (currentUrl !== null) {
    throw problem('invalid_request', 'Invalid request', 'curl command must include exactly one URL')
  }
  return nextUrl
}

function inferMockCurlBodyKind(body: string, headers: CurlHeader[]): CurlParseResponse['parsed']['body_kind'] {
  const contentType = headers.find((header) => header.name.toLowerCase() === 'content-type')?.value.toLowerCase()
  if (contentType?.includes('json') || safeLooksLikeJson(body)) {
    return 'json_string'
  }
  if (contentType?.includes('x-www-form-urlencoded') || body.split('&').every((part) => part.includes('='))) {
    return 'form_string'
  }
  return 'raw_string'
}

function safeLooksLikeJson(value: string): boolean {
  try {
    JSON.parse(value)
    return true
  } catch {
    return false
  }
}

function normalizeMockSupportedOptions(options: string[]): string[] {
  const seen = new Set<string>()
  const normalized = options.filter((option) => {
    if (seen.has(option)) {
      return false
    }
    seen.add(option)
    return true
  })
  return normalized.length === 1 && normalized[0] === '-H' ? [] : normalized
}
