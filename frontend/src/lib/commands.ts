import { invoke } from '@tauri-apps/api/core'
import { browserMockInvoke } from './browser-mocks'

type InvokePayload = Parameters<typeof invoke>[1]

export const COMMANDS = {
  validateJson: 'validate_json',
  formatJson: 'format_json',
  analyzeJson: 'analyze_json',
  getFields: 'get_fields',
  findDuplicates: 'find_duplicates',
  minMaxFilled: 'min_max_filled',
  discoverValuesFields: 'discover_values_fields',
  analyzeValues: 'analyze_values',
  analyzeAdvancedFieldDuplicates: 'analyze_advanced_field_duplicates',
  analyzeCompositeDuplicates: 'analyze_composite_duplicates',
  parseCurl: 'parse_curl',
  validateCurlGuardrail: 'validate_curl_guardrail',
  executeCurl: 'execute_curl',
  startCurlJob: 'start_curl_job',
  getCurlJobResults: 'get_curl_job_results',
  cancelCurlJob: 'cancel_curl_job',
  getConfig: 'get_config',
  getHealth: 'get_health',
} as const

export const HEALTH_COMMAND = COMMANDS.getHealth

export interface ProblemDetails {
  error_type: string
  title: string
  status?: number | null
  detail: string
  instance?: string | null
  invalid_params?: InvalidParam[]
  position?: ErrorPosition | null
}

export interface InvalidParam {
  name: string
  reason: string
}

export interface ErrorPosition {
  offset: number
  line: number
  column: number
}

export function isProblemDetails(error: unknown): error is ProblemDetails {
  if (typeof error !== 'object' || error === null) {
    return false
  }

  const candidate = error as Record<string, unknown>
  return (
    typeof candidate.error_type === 'string' &&
    typeof candidate.title === 'string' &&
    typeof candidate.detail === 'string'
  )
}

export function normalizeCommandError(error: unknown): ProblemDetails {
  if (isProblemDetails(error)) {
    return error
  }

  if (error instanceof Error) {
    return {
      error_type: 'tauri_invoke_error',
      title: error.name || 'Tauri invoke error',
      status: null,
      detail: error.message,
      instance: null,
    }
  }

  if (typeof error === 'string') {
    return {
      error_type: 'tauri_invoke_error',
      title: 'Tauri invoke error',
      status: null,
      detail: error,
      instance: null,
    }
  }

  return {
    error_type: 'tauri_invoke_error',
    title: 'Tauri invoke error',
    status: null,
    detail: stringifyUnknownError(error),
    instance: null,
  }
}

function stringifyUnknownError(error: unknown): string {
  try {
    const json = JSON.stringify(error)
    if (json) {
      return json
    }
  } catch {
    // Fall back to String below; JSON.stringify can throw for circular values or custom toJSON implementations.
  }

  try {
    return String(error)
  } catch {
    return 'Unknown Tauri invoke error'
  }
}

export interface ValidateRequest {
  json_string: string
}

export interface ValidateResponse {
  valid: boolean
  document_count: number
  compact_json: string
  warnings: ValidationWarning[]
}

export interface ValidationWarning {
  warning_type: string
  detail: string
}

export interface FormatRequest {
  json_string: string
}

export interface FormatResponse {
  formatted_json: string
}

export interface AnalyzeRequest {
  json_string: string
  min_max_deep?: boolean
  /** Flatten exactly one level when the analysis root is a list of lists. */
  flatten?: boolean
}

export interface AnalysisResponse {
  structure: StructureAnalysis
  statistics: StatisticsAnalysis
  fields: FieldPattern[]
  exact_duplicates: ExactDuplicatesResult
  min_max_filled: MinMaxFilledResult
}

export interface GetFieldsRequest {
  json_string: string
}

export interface FieldsResponse {
  fields: FieldPattern[]
}

export interface FindDuplicatesRequest {
  json_string: string
  field_path?: string | null
  case_sensitive?: boolean
}

export type DuplicatesResponse =
  | { kind: 'exact'; result: ExactDuplicatesResult }
  | { kind: 'field'; result: FieldDuplicatesResult }

export interface MinMaxRequest {
  json_string: string
  deep?: boolean
}

export interface ValuesFieldDiscoveryRequest {
  json_string: string
  search?: string | null
  limit?: number | null
  flatten?: boolean
}

export interface ValuesFieldDiscoveryResponse {
  fields: ValuesFieldInfo[]
}

export interface ValuesFieldInfo {
  field_path: string
  label: string
  type_hints: string[]
  non_null_count: number
  null_count: number
  missing_count: number
  unique_value_count: number
  sample_values: unknown[]
}

export type SortDirection = 'asc' | 'desc'
export type ValuesSortBy = 'count' | 'value' | 'first_source_path'

export interface ValuesSort {
  by: ValuesSortBy
  direction: SortDirection
}

export interface ValuesAnalysisRequest {
  json_string: string
  selected_fields: string[]
  search?: string | null
  sort: ValuesSort
  page: number
  page_size: number
  include_parent_items?: boolean
  flatten?: boolean
}

export interface ValuesAnalysisResponse {
  selected_fields: string[]
  total_groups: number
  page: number
  page_size: number
  has_next_page: boolean
  groups: ValuesGroup[]
}

export interface ValuesGroup {
  key: unknown[]
  display_value: string
  count: number
  source_paths: string[]
  record_indexes: number[]
  parent_items: ParentItem[]
}

export interface ParentItem {
  record_index: number
  source_path?: string | null
  summary: Record<string, unknown>
}

export interface DuplicateFilter {
  field_path: string
  value: unknown
}

export interface AdvancedFieldDuplicatesRequest {
  json_string: string
  field_path: string
  filter?: DuplicateFilter | null
  case_sensitive?: boolean
  include_parent_items?: boolean
  page: number
  page_size: number
}

export interface AdvancedFieldDuplicatesResponse {
  field_path: string
  total_items_considered: number
  duplicate_group_count: number
  page: number
  page_size: number
  has_next_page: boolean
  duplicates: AdvancedFieldDuplicateGroup[]
  all_values_summary: DuplicateValueSummary[]
}

export interface AdvancedFieldDuplicateGroup {
  value: unknown
  display_value: string
  count: number
  record_indexes: number[]
  source_paths: string[]
  parent_items: ParentItem[]
}

export interface DuplicateValueSummary {
  value: unknown
  display_value: string
  count: number
  is_duplicate: boolean
}

export interface CompositeDuplicatesRequest {
  json_string: string
  field_paths: string[]
  filter?: DuplicateFilter | null
  case_sensitive?: boolean
  include_parent_items?: boolean
  page: number
  page_size: number
}

export interface CompositeDuplicatesResponse {
  field_paths: string[]
  duplicate_group_count: number
  page: number
  page_size: number
  has_next_page: boolean
  duplicates: CompositeDuplicateGroup[]
}

export interface CompositeDuplicateGroup {
  key: unknown[]
  count: number
  record_indexes: number[]
  source_paths: string[]
  parent_items: ParentItem[]
}

export interface AppConfig {
  limits: LimitsConfig
  validation: ValidationConfig
  features: FeatureFlagsConfig
}

export interface LimitsConfig {
  max_json_bytes: number
  max_json_depth: number
  values_explorer: ValuesExplorerLimitsConfig
  duplicates: DuplicateLimitsConfig
  curl: CurlLimitsConfig
}

export interface ValuesExplorerLimitsConfig {
  max_selected_fields: number
  default_page_size: number
  page_sizes: number[]
  max_page_size: number
  max_parent_items_per_group: number
  max_match_combinations_per_record: number
  max_match_combinations_per_request: number
}

export interface DuplicateLimitsConfig {
  composite_min_fields: number
  composite_max_fields: number
  default_page_size: number
  max_page_size: number
  max_match_combinations_per_record: number
  max_match_combinations_per_request: number
}

export interface CurlLimitsConfig {
  enabled: boolean
  default_timeout_ms: number
  max_timeout_ms: number
  max_response_bytes: number
  max_batch_size: number
  large_batch_confirmation_threshold: number
  allow_private_networks_by_default: boolean
}

export interface FeatureFlagsConfig {
  values_explorer: boolean
  advanced_duplicates: boolean
  pdf_export: boolean
  curl_executor: boolean
  curl_single_request_execution: boolean
  curl_jobs: boolean
  curl_batch: boolean
  curl_cancel: boolean
  metrics_ui: boolean
  http_openapi_adapter: boolean
  sqlite_curl_jobs: boolean
}

export interface ValidationConfig {
  schema_json?: string | null
  schema_path?: string | null
  enforcement: 'disabled' | 'warn' | 'error'
}

export interface ConfigResponse {
  config: AppConfig
}

export interface HealthResponse {
  status: string
  app: string
  version: string
}

export interface CurlParseRequest {
  curl: string
}

export interface CurlParseResponse {
  parsed: ParsedCurlPreview
}

export interface ParsedCurlPreview {
  method: string
  url: string
  headers: CurlHeader[]
  body?: string | null
  body_kind?: CurlBodyKind | null
  auth: CurlAuthPreview
  supported_options: string[]
  warnings: string[]
}

export interface CurlHeader {
  name: string
  value: string
  redacted: boolean
}

export type CurlBodyKind = 'json_string' | 'form_string' | 'raw_string'

export interface CurlAuthPreview {
  bearer_token_present: boolean
  scheme?: string | null
}

export interface CurlExecuteRequest {
  curl: string
  timeout_ms?: number | null
  follow_redirects: boolean
}

export interface CurlExecuteResponse {
  request_preview: ParsedCurlPreview
  guardrail: CurlGuardrailDecision
  response?: CurlHttpResponse | null
}

export interface CurlGuardrailRequest {
  method: string
  url: string
  redirect_target?: string | null
}

export interface CurlGuardrailResponse {
  decision: CurlGuardrailDecision
}

export interface CurlGuardrailDecision {
  allowed: boolean
  reason: string
  error_type?: string | null
}

export interface CurlHttpResponse {
  status: number
  status_text?: string | null
  headers: CurlHeader[]
  body: string
  body_truncated: boolean
  elapsed_ms: number
  response_bytes: number
}

export interface CurlStartJobRequest {
  curls: string[]
  timeout_ms?: number | null
  follow_redirects: boolean
  confirm_large_batch: boolean
}

export interface CurlJobRequest {
  job_id: string
}

export interface CurlJobResponse {
  job: CurlJobSummary
}

export interface CurlJobResultsResponse {
  job: CurlJobSummary
  results: CurlJobResult[]
}

export interface CurlJobSummary {
  job_id: string
  status: CurlJobStatus
  total_requests: number
  completed_requests: number
  failed_requests: number
  canceled_requests: number
  created_at_utc: string
  updated_at_utc: string
}

export type CurlJobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled'

export interface CurlJobResult {
  index: number
  status: CurlJobStatus
  request_preview?: ParsedCurlPreview | null
  response?: CurlHttpResponse | null
  error?: SerializableProblem | null
}

export interface SerializableProblem {
  error_type: string
  title: string
  status: number
  detail: string
  invalid_params: SerializableInvalidParam[]
}

export interface SerializableInvalidParam {
  name: string
  reason: string
}

export interface StructureAnalysis {
  type: string
  size: number
  depth: number
  field_paths: string[]
  field_count: number
  schema: SchemaNode
  top_level_size: number
  total_items: number
  container_summary: ContainerSummary
}

export interface ContainerSummary {
  type: string
  is_list_of_lists: boolean
  inner_arrays: number
  empty_inner_arrays: number
  flattened_one_level_items: number
}

export interface SchemaNode {
  type: string
  value?: unknown
  properties: SchemaProperty[]
  items?: SchemaNode | null
  one_of: SchemaNode[]
  length?: number | null
}

export interface SchemaProperty {
  name: string
  schema: SchemaNode
}

export interface StatisticsAnalysis {
  total_fields: number
  type_distribution: TypeCount[]
  null_count: number
  string_length_stats: StringLengthStats
  field_value_distribution: ValueDistribution[]
  unique_field_paths: number
}

export interface TypeCount {
  type: string
  count: number
}

export interface StringLengthStats {
  count: number
  min: number
  max: number
  avg: number
}

export interface ValueDistribution {
  path: string
  values: ValueCount[]
}

export interface ValueCount {
  value: string
  count: number
}

export interface FieldPattern {
  label: string
  pattern: string
  sample_paths: string[]
  category: string
  count: number
}

export interface ExactDuplicatesResult {
  total_items: number
  unique_items: number
  duplicate_groups: number
  duplicates: ExactDuplicateGroup[]
  has_duplicates: boolean
  analysis_path: string
}

export interface ExactDuplicateGroup {
  value: string
  indexes: number[]
}

export interface FieldDuplicatesResult {
  field_path: string
  total_items: number
  unique_values: number
  duplicate_count: number
  duplicates: FieldDuplicateGroup[]
  has_duplicates: boolean
  all_values_summary: FieldDuplicateSummary[]
}

export interface FieldDuplicateGroup {
  value: string
  count: number
  source_paths: string[]
}

export interface FieldDuplicateSummary {
  value: string
  count: number
  is_duplicate: boolean
}

export interface MinMaxFilledResult {
  analysis_path: string
  total_records: number
  min_records: MinMaxRecord[]
  max_records: MinMaxRecord[]
  statistics: MinMaxStatistics
  has_records: boolean
}

export interface MinMaxRecord {
  index: number
  filled_count: number
  total_fields: number
  completeness_pct: number
}

export interface MinMaxStatistics {
  total_records: number
  avg_filled_fields: number
  median_filled_fields: number
  std_filled_fields: number
  avg_completeness_pct: number
  field_count_distribution: CountDistribution[]
}

export interface CountDistribution {
  filled_count: number
  count: number
}

export async function validateJson(request: ValidateRequest): Promise<ValidateResponse> {
  return invokeCommand<ValidateResponse>(COMMANDS.validateJson, { request })
}

export async function formatJson(request: FormatRequest): Promise<FormatResponse> {
  return invokeCommand<FormatResponse>(COMMANDS.formatJson, { request })
}

export async function analyzeJson(request: AnalyzeRequest): Promise<AnalysisResponse> {
  return invokeCommand<AnalysisResponse>(COMMANDS.analyzeJson, { request })
}

export async function getFields(request: GetFieldsRequest): Promise<FieldsResponse> {
  return invokeCommand<FieldsResponse>(COMMANDS.getFields, { request })
}

export async function findDuplicates(request: FindDuplicatesRequest): Promise<DuplicatesResponse> {
  return invokeCommand<DuplicatesResponse>(COMMANDS.findDuplicates, { request })
}

export async function minMaxFilled(request: MinMaxRequest): Promise<MinMaxFilledResult> {
  return invokeCommand<MinMaxFilledResult>(COMMANDS.minMaxFilled, { request })
}

export async function discoverValuesFields(
  request: ValuesFieldDiscoveryRequest,
): Promise<ValuesFieldDiscoveryResponse> {
  return invokeCommand<ValuesFieldDiscoveryResponse>(COMMANDS.discoverValuesFields, { request })
}

export async function analyzeValues(request: ValuesAnalysisRequest): Promise<ValuesAnalysisResponse> {
  return invokeCommand<ValuesAnalysisResponse>(COMMANDS.analyzeValues, { request })
}

export async function analyzeAdvancedFieldDuplicates(
  request: AdvancedFieldDuplicatesRequest,
): Promise<AdvancedFieldDuplicatesResponse> {
  return invokeCommand<AdvancedFieldDuplicatesResponse>(COMMANDS.analyzeAdvancedFieldDuplicates, { request })
}

export async function analyzeCompositeDuplicates(
  request: CompositeDuplicatesRequest,
): Promise<CompositeDuplicatesResponse> {
  return invokeCommand<CompositeDuplicatesResponse>(COMMANDS.analyzeCompositeDuplicates, { request })
}

export async function parseCurl(request: CurlParseRequest): Promise<CurlParseResponse> {
  return invokeCommand<CurlParseResponse>(COMMANDS.parseCurl, { request })
}

export async function validateCurlGuardrail(
  request: CurlGuardrailRequest,
): Promise<CurlGuardrailResponse> {
  return invokeCommand<CurlGuardrailResponse>(COMMANDS.validateCurlGuardrail, { request })
}

export async function executeCurl(request: CurlExecuteRequest): Promise<CurlExecuteResponse> {
  return invokeCommand<CurlExecuteResponse>(COMMANDS.executeCurl, { request })
}

export async function startCurlJob(request: CurlStartJobRequest): Promise<CurlJobResponse> {
  return invokeCommand<CurlJobResponse>(COMMANDS.startCurlJob, { request })
}

export async function getCurlJobResults(request: CurlJobRequest): Promise<CurlJobResultsResponse> {
  return invokeCommand<CurlJobResultsResponse>(COMMANDS.getCurlJobResults, { request })
}

export async function cancelCurlJob(request: CurlJobRequest): Promise<CurlJobResponse> {
  return invokeCommand<CurlJobResponse>(COMMANDS.cancelCurlJob, { request })
}

export async function getConfig(): Promise<ConfigResponse> {
  return invokeCommand<ConfigResponse>(COMMANDS.getConfig)
}

export async function getHealth(): Promise<HealthResponse> {
  return invokeCommand<HealthResponse>(COMMANDS.getHealth)
}

function invokeCommand<T>(command: string, args?: InvokePayload): Promise<T> {
  if (shouldUseBrowserMocks()) {
    return browserMockInvoke<T>(command, args)
  }

  return args === undefined ? invoke<T>(command) : invoke<T>(command, args)
}

function shouldUseBrowserMocks(): boolean {
  if (import.meta.env.MODE === 'test') {
    return false
  }

  if (typeof window === 'undefined') {
    return false
  }

  return import.meta.env.DEV && !('__TAURI_INTERNALS__' in window)
}
