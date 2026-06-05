import sourceFixtures from '../../../../tests/fixtures/golden/source-mvp-starter-fixtures.json'
import parityContracts from '../../../../tests/fixtures/golden/full-source-parity-contracts.json'
import { sampleJsonInput } from '../sample-data'
import type {
  AdvancedFieldDuplicateGroup,
  AdvancedFieldDuplicatesRequest,
  AdvancedFieldDuplicatesResponse,
  AnalysisResponse,
  AnalyzeRequest,
  CompositeDuplicateGroup,
  CompositeDuplicatesRequest,
  CompositeDuplicatesResponse,
  ConfigResponse,
  CurlExecuteRequest,
  CurlExecuteResponse,
  CurlGuardrailRequest,
  CurlGuardrailResponse,
  CurlHeader,
  CurlJobRequest,
  CurlJobResultsResponse,
  CurlJobResponse,
  CurlJobResult,
  CurlJobStatus,
  CurlParseRequest,
  CurlParseResponse,
  CurlStartJobRequest,
  DuplicateFilter,
  DuplicatesResponse,
  FormatRequest,
  FormatResponse,
  ExactDuplicatesResult,
  FieldPattern,
  FieldsResponse,
  HealthResponse,
  MinMaxFilledResult,
  MinMaxRequest,
  ProblemDetails,
  SchemaNode,
  StatisticsAnalysis,
  StructureAnalysis,
  ValidateRequest,
  ValidateResponse,
  ValuesAnalysisRequest,
  ValuesAnalysisResponse,
  ValuesExplorerAnalysisRequest,
  ValuesExplorerAnalysisResponse,
  ValuesExplorerGroup,
  ValuesFieldDiscoveryRequest,
  ValuesFieldDiscoveryResponse,
  ValuesGroup,
} from '../commands'

interface FixtureRoot {
  validation: {
    concatenated_roots: { input: string }
  }
  field_paths_patterns: {
    input_data: unknown
    expected_flattened: Record<string, unknown>
    expected_field_patterns_subset: Record<string, FieldPattern>
  }
  exact_duplicates: {
    input_data: unknown
    expected_source_legacy: {
      total_items: number
      unique_items: number
      duplicate_groups: number
      duplicates: Record<string, number[]>
      has_duplicates: boolean
      analysis_path: string
    }
  }
  min_max_filled: {
    input_data: unknown
    expected_deep_true_summary: FixtureMinMaxSummary
    expected_deep_false_summary: FixtureMinMaxSummary
  }
  structure_statistics: {
    expected_source_statistics: {
      total_fields: number
      type_distribution: Record<string, number>
      null_count: number
      string_length_stats: {
        count: number
        min: number
        max: number
        avg: number
      }
      field_value_distribution: Record<string, Record<string, number>>
      unique_field_paths: number
    }
  }
}

interface ParityFixtureRoot {
  shared_dataset: {
    records: unknown[]
    field_patterns: string[]
  }
  values_explorer: {
    field_discovery_contract: {
      expected_fields: ValuesFieldDiscoveryResponse['fields']
    }
    single_field_values_contract: {
      expected_response: Omit<ValuesAnalysisResponse, 'selected_fields'>
    }
    search_sort_pagination_contract: {
      expected_response: {
        total_groups: number
        groups: Partial<ValuesGroup>[]
      }
    }
    multi_field_values_contract: {
      expected_groups: Partial<ValuesGroup>[]
    }
  }
}

interface ValuePathMatch {
  value: unknown
  sourcePath: string
}

interface MockValuesGroupAccumulator extends ValuesGroup {
  identity: string
  firstSourcePath: string
}

interface FixtureMinMaxSummary {
  analysis_path: string
  total_records: number
  min_record: {
    index: number
    filled_count: number
    total_fields: number
    completeness_pct: number
  }
  max_record: {
    index: number
    filled_count: number
    total_fields: number
    completeness_pct: number
  }
  statistics: {
    total_records: number
    avg_filled_fields: number
    median_filled_fields: number
    std_filled_fields: number
    avg_completeness_pct: number
    field_count_distribution: Record<string, number>
  }
  has_records: boolean
}

const fixtures = sourceFixtures as unknown as FixtureRoot
const parity = parityContracts as unknown as ParityFixtureRoot

export { sampleJsonInput }

const mockCurlJobs = new Map<string, CurlJobResultsResponse>()
let mockCurlJobSequence = 0

export async function browserMockInvoke<T>(command: string, args?: unknown): Promise<T> {
  await nextTick()

  switch (command) {
    case 'validate_json':
      return mockValidate(getRequest<ValidateRequest>(args)) as T
    case 'format_json':
      return mockFormat(getRequest<FormatRequest>(args)) as T
    case 'analyze_json':
      return mockAnalyze(getRequest<AnalyzeRequest>(args)) as T
    case 'get_fields': {
      const response: FieldsResponse = { fields: fixtureFields() }
      return response as T
    }
    case 'find_duplicates': {
      const response: DuplicatesResponse = { kind: 'exact', result: fixtureExactDuplicates() }
      return response as T
    }
    case 'min_max_filled':
      return mockMinMax(getRequest<MinMaxRequest>(args)) as T
    case 'discover_values_fields':
      return mockDiscoverValuesFields(getRequest<ValuesFieldDiscoveryRequest>(args)) as T
    case 'analyze_values':
      return mockAnalyzeValues(getRequest<ValuesAnalysisRequest>(args)) as T
    case 'analyze_values_explorer':
      return mockValuesExplorerResponse(getRequest<ValuesExplorerAnalysisRequest>(args)) as T
    case 'analyze_advanced_field_duplicates':
      return mockAnalyzeAdvancedFieldDuplicates(getRequest<AdvancedFieldDuplicatesRequest>(args)) as T
    case 'analyze_composite_duplicates':
      return mockAnalyzeCompositeDuplicates(getRequest<CompositeDuplicatesRequest>(args)) as T
    case 'parse_curl':
      return mockParseCurl(getRequest<CurlParseRequest>(args)) as T
    case 'validate_curl_guardrail':
      return mockValidateCurlGuardrail(getRequest<CurlGuardrailRequest>(args)) as T
    case 'execute_curl':
      return mockExecuteCurl(getRequest<CurlExecuteRequest>(args)) as T
    case 'start_curl_job':
      return mockStartCurlJob(getRequest<CurlStartJobRequest>(args)) as T
    case 'get_curl_job_results':
      return mockGetCurlJobResults(getRequest<CurlJobRequest>(args)) as T
    case 'cancel_curl_job':
      return mockCancelCurlJob(getRequest<CurlJobRequest>(args)) as T
    case 'get_config': {
      const response: ConfigResponse = { config: mockConfig() }
      return response as T
    }
    case 'get_health': {
      const response: HealthResponse = { status: 'ok', app: 'json-analyzer', version: 'browser-mock' }
      return response as T
    }
    default:
      throw problem('unknown_command', 'Unknown command', `No browser mock exists for ${command}`)
  }
}

function mockValidate(request: ValidateRequest): ValidateResponse {
  if (request.json_string.length === 0) {
    throw problem('invalid_request', 'Invalid request', 'json_string cannot be empty')
  }

  if (request.json_string === fixtures.validation.concatenated_roots.input) {
    throw problem(
      'json_parse_error',
      'Invalid JSON',
      'trailing characters after JSON root at line 2 column 1 (byte 9)',
      { offset: 9, line: 2, column: 1 },
    )
  }

  try {
    const parsed = JSON.parse(request.json_string) as unknown
    return {
      valid: true,
      document_count: 1,
      compact_json: JSON.stringify(parsed),
      warnings: [],
    }
  } catch (error) {
    throw problem(
      'json_parse_error',
      'Invalid JSON',
      error instanceof Error ? error.message : 'Unable to parse JSON input',
    )
  }
}

function mockFormat(request: FormatRequest): FormatResponse {
  mockValidate({ json_string: request.json_string })

  return {
    formatted_json: mayContainDuplicateObjectKeys(request.json_string)
      ? request.json_string.trim()
      : JSON.stringify(safeParseJson(request.json_string), null, 2),
  }
}

function mockAnalyze(request: AnalyzeRequest): AnalysisResponse {
  mockValidate({ json_string: request.json_string })
  const parsed = flattenOneLevelIfListOfLists(safeParseJson(request.json_string), request.flatten ?? false)
  const structure = fixtureStructure(parsed)
  return {
    structure,
    statistics: fixtureStatistics(),
    fields: fixtureFields(),
    exact_duplicates: fixtureExactDuplicates(),
    min_max_filled: fixtureMinMax(request.min_max_deep ?? true),
  }
}

function mockMinMax(request: MinMaxRequest): MinMaxFilledResult {
  mockValidate({ json_string: request.json_string })
  return fixtureMinMax(request.deep ?? true)
}

function mockDiscoverValuesFields(
  request: ValuesFieldDiscoveryRequest,
): ValuesFieldDiscoveryResponse {
  if (request.limit === 0) {
    throw problem('invalid_request', 'Invalid request', 'limit must be greater than or equal to 1 when provided')
  }

  mockValidate({ json_string: request.json_string })
  flattenOneLevelIfListOfLists(safeParseJson(request.json_string), request.flatten ?? false)
  const search = request.search?.trim().toLowerCase()
  let fields = mockValuesFields()

  if (search) {
    fields = fields.filter(
      (field) =>
        field.field_path.toLowerCase().includes(search) || field.label.toLowerCase().includes(search),
    )
  }

  return { fields: request.limit === undefined || request.limit === null ? fields : fields.slice(0, request.limit) }
}

function mockAnalyzeValues(request: ValuesAnalysisRequest): ValuesAnalysisResponse {
  mockValidate({ json_string: request.json_string })
  flattenOneLevelIfListOfLists(safeParseJson(request.json_string), request.flatten ?? false)

  const valuesLimits = mockConfig().limits.values_explorer
  if (request.selected_fields.length === 0 || request.selected_fields.length > valuesLimits.max_selected_fields) {
    throw problem('invalid_request', 'Invalid request', `selected_fields supports 1 to ${valuesLimits.max_selected_fields} fields`)
  }

  const selectedFields = request.selected_fields.map((field) => field.trim())
  if (selectedFields.some((field) => field.length === 0)) {
    throw problem('invalid_request', 'Invalid request', 'selected_fields cannot contain empty fields')
  }
  if (new Set(selectedFields).size !== selectedFields.length) {
    throw problem('invalid_request', 'Invalid request', 'selected_fields must contain unique fields')
  }

  if (request.page < 1) {
    throw problem('invalid_request', 'Invalid request', 'page must be greater than or equal to 1')
  }

  if (request.page_size < 1) {
    throw problem('invalid_request', 'Invalid request', 'page_size must be greater than or equal to 1')
  }
  if (request.page_size > valuesLimits.max_page_size) {
    throw problem('invalid_request', 'Invalid request', `page_size cannot exceed ${valuesLimits.max_page_size}`)
  }

  const normalizedRequest = { ...request, selected_fields: selectedFields }
  const allGroups = buildMockValuesGroups(normalizedRequest)
  const totalGroups = allGroups.length
  const start = (request.page - 1) * request.page_size
  const end = Math.min(start + request.page_size, totalGroups)
  const groups = start >= totalGroups ? [] : allGroups.slice(start, end)

  return {
    selected_fields: selectedFields,
    total_groups: totalGroups,
    page: request.page,
    page_size: request.page_size,
    has_next_page: end < totalGroups,
    groups,
  }
}

export function mockValuesExplorerResponse(request: ValuesExplorerAnalysisRequest): ValuesExplorerAnalysisResponse {
  mockValidate({ json_string: request.json_string })
  flattenOneLevelIfListOfLists(safeParseJson(request.json_string), request.flatten ?? false)

  const valuesLimits = mockConfig().limits.values_explorer
  if (request.selected_fields.length === 0 || request.selected_fields.length > valuesLimits.max_selected_fields) {
    throw problem('invalid_request', 'Invalid request', `selected_fields supports 1 to ${valuesLimits.max_selected_fields} fields`)
  }
  validateMockPagination(request.page, request.page_size, valuesLimits.max_page_size)
  const groupsPage = request.groups_page ?? request.page
  if (groupsPage < 1) {
    throw problem('invalid_request', 'Invalid request', 'groups_page must be greater than or equal to 1')
  }

  const selectedFields = request.selected_fields.map((field) => field.trim())
  if (selectedFields.some((field) => field.length === 0)) {
    throw problem('invalid_request', 'Invalid request', 'selected_fields cannot contain empty fields')
  }
  if (new Set(selectedFields).size !== selectedFields.length) {
    throw problem('invalid_request', 'Invalid request', 'selected_fields must contain unique fields')
  }
  if (request.filter && (!request.filter.field_path.trim() || !request.filter.value.trim())) {
    throw problem('invalid_request', 'Invalid request', 'filter field and value are required')
  }

  const groups = buildMockValuesExplorerGroups({ ...request, selected_fields: selectedFields })
  const duplicateGroups = groups.filter((group) => group.count > 1)
  const start = (request.page - 1) * request.page_size
  const end = start + request.page_size
  const allStart = (groupsPage - 1) * request.page_size
  const allEnd = allStart + request.page_size
  const duplicatePage = duplicateGroups.slice(start, end)
  const allPage = groups.slice(allStart, allEnd)

  return {
    field_path: selectedFields.join(' + '),
    field_paths: selectedFields,
    is_composite: selectedFields.length > 1,
    total_items: groups.reduce((total, group) => total + group.count, 0),
    unique_values: groups.length,
    duplicate_group_count: duplicateGroups.length,
    has_duplicates: duplicateGroups.length > 0,
    duplicates: duplicatePage,
    all_field_values: allPage,
    page: request.page,
    page_size: request.page_size,
    total_pages: Math.max(1, Math.ceil(duplicateGroups.length / request.page_size)),
    has_next_page: request.page < Math.max(1, Math.ceil(duplicateGroups.length / request.page_size)),
    groups_page: groupsPage,
    groups_total_pages: Math.max(1, Math.ceil(groups.length / request.page_size)),
    sort_mode: request.sort_mode,
    filter: request.filter ?? null,
  }
}

function mockAnalyzeAdvancedFieldDuplicates(
  request: AdvancedFieldDuplicatesRequest,
): AdvancedFieldDuplicatesResponse {
  mockValidate({ json_string: request.json_string })

  if (request.field_path.trim().length === 0) {
    throw problem('invalid_request', 'Invalid request', 'field_path cannot be empty')
  }
  validateMockPagination(request.page, request.page_size, mockConfig().limits.duplicates.max_page_size)

  const groups = buildMockAdvancedFieldDuplicateGroups(request)
  const duplicateGroups = groups.filter((group) => group.count > 1)
  const start = (request.page - 1) * request.page_size
  const end = Math.min(start + request.page_size, duplicateGroups.length)

  return {
    field_path: request.field_path,
    total_items_considered: groups.reduce((total, group) => total + group.count, 0),
    duplicate_group_count: duplicateGroups.length,
    page: request.page,
    page_size: request.page_size,
    has_next_page: end < duplicateGroups.length,
    duplicates: start >= duplicateGroups.length ? [] : duplicateGroups.slice(start, end),
    all_values_summary: groups.map((group) => ({
      value: group.value,
      display_value: group.display_value,
      count: group.count,
      is_duplicate: group.count > 1,
    })),
  }
}

function mockAnalyzeCompositeDuplicates(request: CompositeDuplicatesRequest): CompositeDuplicatesResponse {
  mockValidate({ json_string: request.json_string })

  const duplicateLimits = mockConfig().limits.duplicates
  if (request.field_paths.length < duplicateLimits.composite_min_fields || request.field_paths.length > duplicateLimits.composite_max_fields) {
    throw problem('invalid_request', 'Invalid request', `field_paths supports ${duplicateLimits.composite_min_fields} to ${duplicateLimits.composite_max_fields} fields`)
  }
  if (new Set(request.field_paths.map((field) => field.trim())).size !== request.field_paths.length) {
    throw problem('invalid_request', 'Invalid request', 'field_paths must contain unique fields')
  }
  validateMockPagination(request.page, request.page_size, mockConfig().limits.duplicates.max_page_size)

  const groups = buildMockCompositeDuplicateGroups(request).filter((group) => group.count > 1)
  const start = (request.page - 1) * request.page_size
  const end = Math.min(start + request.page_size, groups.length)

  return {
    field_paths: request.field_paths,
    duplicate_group_count: groups.length,
    page: request.page,
    page_size: request.page_size,
    has_next_page: end < groups.length,
    duplicates: start >= groups.length ? [] : groups.slice(start, end),
  }
}

function mockParseCurl(request: CurlParseRequest): CurlParseResponse {
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

function mockExecuteCurl(request: CurlExecuteRequest): CurlExecuteResponse {
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

function mockStartCurlJob(request: CurlStartJobRequest): CurlJobResponse {
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

function mockGetCurlJobResults(request: CurlJobRequest): CurlJobResultsResponse {
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

function mockCancelCurlJob(request: CurlJobRequest): CurlJobResponse {
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

function mockValidateCurlGuardrail(request: CurlGuardrailRequest): CurlGuardrailResponse {
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

function mockConfig(): ConfigResponse['config'] {
  return {
    limits: {
      max_json_bytes: 16 * 1024 * 1024,
      max_json_depth: 512,
      values_explorer: {
        max_selected_fields: 5,
        default_page_size: 25,
        page_sizes: [10, 25, 50, 100],
        max_page_size: 100,
        max_parent_items_per_group: 100,
        max_match_combinations_per_record: 10_000,
        max_match_combinations_per_request: 100_000,
      },
      duplicates: {
        composite_min_fields: 2,
        composite_max_fields: 5,
        default_page_size: 25,
        max_page_size: 100,
        max_match_combinations_per_record: 10_000,
        max_match_combinations_per_request: 100_000,
      },
      curl: {
        enabled: true,
        default_timeout_ms: 30_000,
        max_timeout_ms: 120_000,
        max_response_bytes: 1_048_576,
        max_batch_size: 100,
        large_batch_confirmation_threshold: 20,
        allow_private_networks_by_default: false,
      },
    },
    validation: { schema_json: null, schema_path: null, enforcement: 'disabled' },
    features: {
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
    },
  }
}

function validateMockPagination(page: number, pageSize: number, maxPageSize: number) {
  if (page < 1) {
    throw problem('invalid_request', 'Invalid request', 'page must be greater than or equal to 1')
  }
  if (pageSize < 1) {
    throw problem('invalid_request', 'Invalid request', 'page_size must be greater than or equal to 1')
  }
  if (pageSize > maxPageSize) {
    throw problem('invalid_request', 'Invalid request', `page_size cannot exceed ${maxPageSize}`)
  }
}

function buildMockAdvancedFieldDuplicateGroups(request: AdvancedFieldDuplicatesRequest): AdvancedFieldDuplicateGroup[] {
  const groups: (AdvancedFieldDuplicateGroup & { identity: string; firstSourcePath: string })[] = []
  const caseSensitive = request.case_sensitive ?? true

  parity.shared_dataset.records.forEach((record, recordIndex) => {
    if (!mockRecordMatchesFilter(record, request.filter ?? null, caseSensitive)) {
      return
    }

    for (const match of valuePathMatchesAtFieldPath(record, request.field_path)) {
      if (match.value === null) {
        continue
      }
      const value = caseSensitive ? normalizeJsonValue(match.value) : normalizeCaseInsensitiveValue(match.value)
      const identity = `${typeHintForValue(value)}:${JSON.stringify(value)}`
      const sourcePath = recordSourcePath(recordIndex, match.sourcePath)
      const existing = groups.find((group) => group.identity === identity)

      if (existing) {
        existing.count += 1
        existing.source_paths.push(sourcePath)
        if (!existing.record_indexes.includes(recordIndex)) {
          existing.record_indexes.push(recordIndex)
        }
        if (request.include_parent_items && !existing.parent_items.some((item) => item.record_index === recordIndex)) {
          existing.parent_items.push(parentItemForMockRecord(record, recordIndex, [request.field_path, request.filter?.field_path ?? '']))
        }
        continue
      }

      groups.push({
        identity,
        firstSourcePath: sourcePath,
        value,
        display_value: displayMockValue(match.value),
        count: 1,
        source_paths: [sourcePath],
        record_indexes: [recordIndex],
        parent_items: request.include_parent_items
          ? [parentItemForMockRecord(record, recordIndex, [request.field_path, request.filter?.field_path ?? ''])]
          : [],
      })
    }
  })

  groups.sort((left, right) => right.count - left.count || left.display_value.localeCompare(right.display_value) || left.firstSourcePath.localeCompare(right.firstSourcePath))
  return groups.map(({ identity: _identity, firstSourcePath: _firstSourcePath, ...group }) => group)
}

function buildMockCompositeDuplicateGroups(request: CompositeDuplicatesRequest): CompositeDuplicateGroup[] {
  const groups: (CompositeDuplicateGroup & { identity: string; displayValue: string; firstSourcePath: string })[] = []
  const caseSensitive = request.case_sensitive ?? true

  parity.shared_dataset.records.forEach((record, recordIndex) => {
    if (!mockRecordMatchesFilter(record, request.filter ?? null, caseSensitive)) {
      return
    }

    const perFieldMatches = request.field_paths.map((fieldPath) => valuePathMatchesAtFieldPath(record, fieldPath))
    if (perFieldMatches.some((matches) => matches.length === 0)) {
      return
    }

    for (const combination of cartesianValueMatches(perFieldMatches)) {
      const key = combination.map((match) => caseSensitive ? normalizeJsonValue(match.value) : normalizeCaseInsensitiveValue(match.value))
      const identity = key.map((value) => `${typeHintForValue(value)}:${JSON.stringify(value)}`).join('|')
      const sourcePaths = combination.map((match) => recordSourcePath(recordIndex, match.sourcePath))
      const displayValue = combination.map((match) => displayMockValue(match.value)).join(' | ')
      const existing = groups.find((group) => group.identity === identity)

      if (existing) {
        existing.count += 1
        existing.source_paths.push(...sourcePaths)
        if (!existing.record_indexes.includes(recordIndex)) {
          existing.record_indexes.push(recordIndex)
        }
        if (request.include_parent_items && !existing.parent_items.some((item) => item.record_index === recordIndex)) {
          existing.parent_items.push(parentItemForMockRecord(record, recordIndex, request.field_paths))
        }
        continue
      }

      groups.push({
        identity,
        displayValue,
        firstSourcePath: sourcePaths[0] ?? '',
        key,
        count: 1,
        source_paths: sourcePaths,
        record_indexes: [recordIndex],
        parent_items: request.include_parent_items ? [parentItemForMockRecord(record, recordIndex, request.field_paths)] : [],
      })
    }
  })

  groups.sort((left, right) => right.count - left.count || left.displayValue.localeCompare(right.displayValue) || left.firstSourcePath.localeCompare(right.firstSourcePath))
  return groups.map(({ identity: _identity, displayValue: _displayValue, firstSourcePath: _firstSourcePath, ...group }) => group)
}

function mockRecordMatchesFilter(record: unknown, filter: DuplicateFilter | null, caseSensitive: boolean): boolean {
  if (!filter) {
    return true
  }

  const expected = caseSensitive ? normalizeJsonValue(filter.value) : normalizeCaseInsensitiveValue(filter.value)
  return valuePathMatchesAtFieldPath(record, filter.field_path).some((match) => {
    const actual = caseSensitive ? normalizeJsonValue(match.value) : normalizeCaseInsensitiveValue(match.value)
    return JSON.stringify(actual) === JSON.stringify(expected)
  })
}

function normalizeCaseInsensitiveValue(value: unknown): unknown {
  return typeof value === 'string' ? value.toLowerCase() : normalizeJsonValue(value)
}

function buildMockValuesGroups(request: ValuesAnalysisRequest): ValuesGroup[] {
  const groups: MockValuesGroupAccumulator[] = []

  parity.shared_dataset.records.forEach((record, recordIndex) => {
    const perFieldMatches = request.selected_fields.map((fieldPath) => valuePathMatchesAtFieldPath(record, fieldPath))
    if (perFieldMatches.some((matches) => matches.length === 0)) {
      return
    }

    for (const combination of cartesianValueMatches(perFieldMatches)) {
      const key = combination.map((match) => normalizeJsonValue(match.value))
      const identity = key.map((value) => `${typeHintForValue(value)}:${JSON.stringify(value)}`).join('|')
      const displayValue = key.map(displayMockValue).join(' | ')
      const sourcePaths = combination.map((match) => recordSourcePath(recordIndex, match.sourcePath))
      const existing = groups.find((group) => group.identity === identity)

      if (existing) {
        existing.count += 1
        existing.source_paths.push(...sourcePaths)
        if (!existing.record_indexes.includes(recordIndex)) {
          existing.record_indexes.push(recordIndex)
        }
        if (request.include_parent_items && !existing.parent_items.some((item) => item.record_index === recordIndex)) {
          existing.parent_items.push(parentItemForMockRecord(record, recordIndex, request.selected_fields))
        }
        continue
      }

      groups.push({
        identity,
        firstSourcePath: sourcePaths[0] ?? '',
        key,
        display_value: displayValue,
        count: 1,
        source_paths: sourcePaths,
        record_indexes: [recordIndex],
        parent_items: request.include_parent_items ? [parentItemForMockRecord(record, recordIndex, request.selected_fields)] : [],
      })
    }
  })

  const search = request.search?.trim().toLowerCase()
  const filteredGroups = search
    ? groups.filter((group) => `${group.display_value} ${group.key.map(displayMockValue).join(' ')}`.toLowerCase().includes(search))
    : groups

  filteredGroups.sort((left, right) => {
    let primary = 0
    switch (request.sort.by) {
      case 'count':
        primary = left.count - right.count
        break
      case 'value':
        primary = left.display_value.localeCompare(right.display_value)
        break
      case 'first_source_path':
        primary = left.firstSourcePath.localeCompare(right.firstSourcePath)
        break
    }

    if (request.sort.direction === 'desc') {
      primary *= -1
    }

    return primary || left.display_value.localeCompare(right.display_value) || left.firstSourcePath.localeCompare(right.firstSourcePath)
  })

  return filteredGroups.map((group) => ({
    key: group.key,
    display_value: group.display_value,
    count: group.count,
    source_paths: group.source_paths,
    record_indexes: group.record_indexes,
    parent_items: group.parent_items,
  }))
}

function buildMockValuesExplorerGroups(request: ValuesExplorerAnalysisRequest): ValuesExplorerGroup[] {
  const grouped = buildMockValuesGroups({
    json_string: request.json_string,
    selected_fields: request.selected_fields,
    search: null,
    sort: request.sort_mode === 'alphabetical' ? { by: 'value', direction: 'asc' } : { by: 'count', direction: 'desc' },
    page: 1,
    page_size: mockConfig().limits.values_explorer.max_page_size,
    include_parent_items: true,
    flatten: request.flatten,
  })

  const filteredGroups = request.filter
    ? grouped
      .map((group) => ({
        ...group,
        parent_items: group.parent_items.filter((item) => mockRecordMatchesExplorerFilter(item.record_index, request.filter)),
      }))
      .filter((group) => group.parent_items.length > 0)
      .map((group) => ({
        ...group,
        count: group.parent_items.length,
        record_indexes: group.parent_items.map((item) => item.record_index),
      }))
    : grouped

  return filteredGroups.map((group) => ({
    value: group.key.length === 1 ? group.key[0] : group.key,
    display_value: group.display_value,
    count: group.count,
    is_duplicate: group.count > 1,
    items: group.parent_items.map((item) => ({
      index: item.record_index,
      item: item.summary,
      source_path: item.source_path,
      field_value: group.key.length === 1 ? group.key[0] : group.key,
    })),
  }))
}

function mockRecordMatchesExplorerFilter(recordIndex: number, filter: ValuesExplorerAnalysisRequest['filter']): boolean {
  if (!filter) {
    return true
  }

  const record = parity.shared_dataset.records[recordIndex]
  const values = valuePathMatchesAtFieldPath(record, filter.field_path).map((match) => displayMockValue(normalizeJsonValue(match.value)))
  const needle = filter.case_sensitive ? filter.value : filter.value.toLowerCase()

  return values.some((value) => {
    const haystack = filter.case_sensitive ? value : value.toLowerCase()
    return filter.match_mode === 'exact' ? haystack === needle : haystack.includes(needle)
  })
}

function cartesianValueMatches(matchesByField: ValuePathMatch[][]): ValuePathMatch[][] {
  return matchesByField.reduce<ValuePathMatch[][]>(
    (combinations, matches) => combinations.flatMap((combination) => matches.map((match) => [...combination, match])),
    [[]],
  )
}

function valuePathMatchesAtFieldPath(record: unknown, fieldPath: string): ValuePathMatch[] {
  const parts = fieldPath.replace(/^\[\]\.?/, '').split('.').filter(Boolean)
  let currentValues: ValuePathMatch[] = [{ value: record, sourcePath: '' }]

  for (const part of parts) {
    const nextValues: ValuePathMatch[] = []
    for (const current of currentValues) {
      if (part === '[]') {
        if (Array.isArray(current.value)) {
          current.value.forEach((item, index) => {
            nextValues.push({ value: item, sourcePath: appendMockPath(current.sourcePath, String(index)) })
          })
        }
        continue
      }

      if (typeof current.value === 'object' && current.value !== null && Object.prototype.hasOwnProperty.call(current.value, part)) {
        nextValues.push({
          value: (current.value as Record<string, unknown>)[part],
          sourcePath: appendMockPath(current.sourcePath, part),
        })
      }
    }
    currentValues = nextValues
  }

  return currentValues
}

function parentItemForMockRecord(record: unknown, recordIndex: number, selectedFields: string[]): ValuesGroup['parent_items'][number] {
  const summary: Record<string, unknown> = {}
  if (typeof record === 'object' && record !== null) {
    const objectRecord = record as Record<string, unknown>
    for (const key of ['id', 'name']) {
      if (isMockSummaryValue(objectRecord[key])) {
        summary[key] = objectRecord[key]
      }
    }
    for (const fieldPath of selectedFields) {
      const firstSegment = fieldPath.replace(/^\[\]\.?/, '').split('.')[0]
      if (firstSegment && !(firstSegment in summary) && isMockSummaryValue(objectRecord[firstSegment])) {
        summary[firstSegment] = objectRecord[firstSegment]
      }
    }
  }

  return { record_index: recordIndex, source_path: String(recordIndex), summary }
}

function isMockSummaryValue(value: unknown): boolean {
  return value === null || ['string', 'number', 'boolean'].includes(typeof value)
}

function normalizeJsonValue(value: unknown): unknown {
  return value === undefined ? null : value
}

function displayMockValue(value: unknown): string {
  if (value === null) {
    return 'null'
  }
  if (typeof value === 'string') {
    return value
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  return JSON.stringify(value)
}

function recordSourcePath(recordIndex: number, sourcePath: string): string {
  return sourcePath ? `${recordIndex}.${sourcePath}` : String(recordIndex)
}

function appendMockPath(base: string, segment: string): string {
  return base ? `${base}.${segment}` : segment
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

function getRequest<T>(args: unknown): T {
  if (typeof args !== 'object' || args === null || !('request' in args)) {
    throw problem('invalid_request', 'Invalid request', 'Missing Tauri request payload')
  }
  return (args as { request: T }).request
}

function fixtureFields(): FieldPattern[] {
  return Object.values(fixtures.field_paths_patterns.expected_field_patterns_subset)
}

function fixtureStructure(parsed: unknown): StructureAnalysis {
  const flattenedPaths = Object.keys(fixtures.field_paths_patterns.expected_flattened)
  const valueType = Array.isArray(parsed) ? 'list' : typeof parsed === 'object' && parsed !== null ? 'dict' : typeof parsed
  const size = Array.isArray(parsed)
    ? parsed.length
    : typeof parsed === 'object' && parsed !== null
      ? Object.keys(parsed).length
      : 1
  const isListOfLists = Array.isArray(parsed) && parsed.every((item) => Array.isArray(item))
  const flattenedOneLevelItems = isListOfLists
    ? parsed.reduce((count, item) => count + (item as unknown[]).length, 0)
    : 0

  return {
    type: valueType,
    size,
    depth: 4,
    field_paths: flattenedPaths,
    field_count: flattenedPaths.length,
    schema: objectSchema([
      { name: 'users', schema: arraySchema(objectSchema([]), 3) },
      { name: 'metadata', schema: objectSchema([]) },
    ]),
    top_level_size: size,
    total_items: isListOfLists ? flattenedOneLevelItems : size,
    container_summary: {
      type: valueType,
      is_list_of_lists: isListOfLists,
      inner_arrays: isListOfLists ? parsed.length : 0,
      empty_inner_arrays: isListOfLists
        ? parsed.filter((item) => Array.isArray(item) && item.length === 0).length
        : 0,
      flattened_one_level_items: flattenedOneLevelItems,
    },
  }
}

function fixtureStatistics(): StatisticsAnalysis {
  const expected = fixtures.structure_statistics.expected_source_statistics
  return {
    total_fields: expected.total_fields,
    type_distribution: Object.entries(expected.type_distribution).map(([type, count]) => ({
      type,
      count,
    })),
    null_count: expected.null_count,
    string_length_stats: expected.string_length_stats,
    field_value_distribution: Object.entries(expected.field_value_distribution).map(([path, values]) => ({
      path,
      values: Object.entries(values).map(([value, count]) => ({ value, count })),
    })),
    unique_field_paths: expected.unique_field_paths,
  }
}

function mockValuesFields(): ValuesFieldDiscoveryResponse['fields'] {
  return parity.shared_dataset.field_patterns.map((fieldPath) => fieldInfoFromRecords(fieldPath))
}

function fieldInfoFromRecords(fieldPath: string): ValuesFieldDiscoveryResponse['fields'][number] {
  const values: unknown[] = []
  let missingCount = 0
  let nullCount = 0

  for (const record of parity.shared_dataset.records) {
    const recordValues = valuesAtFieldPath(record, fieldPath)
    if (recordValues.length === 0) {
      missingCount += 1
      continue
    }

    for (const value of recordValues) {
      if (value === null) {
        nullCount += 1
      } else {
        values.push(value)
      }
    }
  }

  const uniqueValues = uniqueUnknown(values)
  return {
    field_path: fieldPath,
    label: labelForFieldPath(fieldPath),
    type_hints: uniqueValues.length === 0 ? [] : uniqueValues.map(typeHintForValue).filter(uniqueString),
    non_null_count: values.length,
    null_count: nullCount,
    missing_count: missingCount,
    unique_value_count: uniqueValues.length,
    sample_values: uniqueValues.slice(0, 3),
  }
}

function valuesAtFieldPath(record: unknown, fieldPath: string): unknown[] {
  const parts = fieldPath.replace(/^\[\]\.?/, '').split('.').filter(Boolean)
  let currentValues: unknown[] = [record]

  for (const part of parts) {
    const nextValues: unknown[] = []
    for (const current of currentValues) {
      if (part === '[]') {
        if (Array.isArray(current)) {
          nextValues.push(...current)
        }
        continue
      }

      if (typeof current === 'object' && current !== null && part in current) {
        nextValues.push((current as Record<string, unknown>)[part])
      }
    }
    currentValues = nextValues
  }

  return currentValues
}

function labelForFieldPath(fieldPath: string): string {
  const pathParts = fieldPath.split('.').filter((part) => part !== '[]')
  const lastPart = pathParts[pathParts.length - 1]?.replace(/^\[\]/, '') || fieldPath
  return lastPart
    .split(/[_-]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function uniqueUnknown(values: unknown[]): unknown[] {
  const seen = new Set<string>()
  const uniqueValues: unknown[] = []
  for (const value of values) {
    const key = JSON.stringify(value)
    if (!seen.has(key)) {
      seen.add(key)
      uniqueValues.push(value)
    }
  }
  return uniqueValues
}

function uniqueString(value: string, index: number, values: string[]): boolean {
  return values.indexOf(value) === index
}

function typeHintForValue(value: unknown): string {
  if (Array.isArray(value)) {
    return 'list'
  }

  if (value === null) {
    return 'null'
  }

  switch (typeof value) {
    case 'string':
      return 'str'
    case 'number':
      return 'number'
    case 'boolean':
      return 'bool'
    case 'object':
      return 'dict'
    default:
      return typeof value
  }
}

function fixtureExactDuplicates(): ExactDuplicatesResult {
  const expected = fixtures.exact_duplicates.expected_source_legacy
  return {
    total_items: expected.total_items,
    unique_items: expected.unique_items,
    duplicate_groups: expected.duplicate_groups,
    duplicates: Object.entries(expected.duplicates).map(([value, indexes]) => ({
      value: compactJsonString(value),
      indexes,
    })),
    has_duplicates: expected.has_duplicates,
    analysis_path: expected.analysis_path,
  }
}

function fixtureMinMax(deep: boolean): MinMaxFilledResult {
  const expected = deep
    ? fixtures.min_max_filled.expected_deep_true_summary
    : fixtures.min_max_filled.expected_deep_false_summary
  return {
    analysis_path: expected.analysis_path,
    total_records: expected.total_records,
    min_records: [expected.min_record],
    max_records: [expected.max_record],
    statistics: {
      total_records: expected.statistics.total_records,
      avg_filled_fields: expected.statistics.avg_filled_fields,
      median_filled_fields: expected.statistics.median_filled_fields,
      std_filled_fields: expected.statistics.std_filled_fields,
      avg_completeness_pct: expected.statistics.avg_completeness_pct,
      field_count_distribution: Object.entries(expected.statistics.field_count_distribution).map(
        ([filled_count, count]) => ({ filled_count: Number(filled_count), count }),
      ),
    },
    has_records: expected.has_records,
  }
}

function objectSchema(properties: { name: string; schema: SchemaNode }[]): SchemaNode {
  return { type: 'object', properties, items: null, one_of: [], length: null }
}

function arraySchema(items: SchemaNode, length: number): SchemaNode {
  return { type: 'array', properties: [], items, one_of: [], length }
}

function safeParseJson(input: string): unknown {
  try {
    return JSON.parse(input) as unknown
  } catch {
    return fixtures.field_paths_patterns.input_data
  }
}

function mayContainDuplicateObjectKeys(input: string): boolean {
  return /"([^"\\]*(?:\\.[^"\\]*)*)"\s*:.*"\1"\s*:/s.test(input)
}

function flattenOneLevelIfListOfLists(input: unknown, shouldFlatten: boolean): unknown {
  if (!shouldFlatten || !Array.isArray(input) || input.length === 0 || !input.every((item) => Array.isArray(item))) {
    return input
  }

  return input.flatMap((item) => item as unknown[])
}

function problem(
  errorType: string,
  title: string,
  detail: string,
  position?: ProblemDetails['position'],
): ProblemDetails {
  return {
    error_type: errorType,
    title,
    status:
      errorType === 'parse_error' ||
      errorType === 'json_parse_error' ||
      errorType === 'invalid_request' ||
      errorType === 'unsupported_file_upload_option'
        ? 400
        : errorType === 'curl_guardrail_denied'
          ? 403
          : errorType === 'curl_timeout'
            ? 504
            : null,
    detail,
    instance: null,
    position,
  }
}

function compactJsonString(value: string): string {
  try {
    return JSON.stringify(JSON.parse(value) as unknown)
  } catch {
    return value
  }
}

function nextTick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 75))
}
