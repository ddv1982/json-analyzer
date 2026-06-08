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

export type ValuesExplorerSortMode = 'frequency' | 'alphabetical'
export type ValuesExplorerFilterMatchMode = 'contains' | 'exact'

export interface ValuesExplorerFilter {
  field_path: string
  value: string
  match_mode?: ValuesExplorerFilterMatchMode
  case_sensitive?: boolean
}

export interface ValuesExplorerAnalysisRequest {
  json_string: string
  selected_fields: string[]
  filter?: ValuesExplorerFilter | null
  sort_mode: ValuesExplorerSortMode
  /** Page for duplicate result groups. */
  page: number
  /** Page for all result groups. Defaults to `page` when omitted. */
  groups_page?: number | null
  page_size: number
  flatten?: boolean
}

export interface ValuesExplorerAnalysisResponse {
  field_path: string
  field_paths: string[]
  is_composite: boolean
  total_items: number
  unique_values: number
  duplicate_group_count: number
  has_duplicates: boolean
  duplicates: ValuesExplorerGroup[]
  all_field_values: ValuesExplorerGroup[]
  page: number
  page_size: number
  total_pages: number
  has_next_page: boolean
  groups_page: number
  groups_total_pages: number
  sort_mode: ValuesExplorerSortMode
  filter?: ValuesExplorerFilter | null
}

export interface ValuesExplorerGroup {
  value: unknown
  display_value: string
  count: number
  is_duplicate: boolean
  items: ValuesExplorerItem[]
}

export interface ValuesExplorerItem {
  index: number
  item: unknown
  source_path?: string | null
  field_value: unknown
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
  default_max_concurrency: number
  max_concurrency: number
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
  curl: string
  placeholder?: string | null
  values?: string[]
  timeout_ms?: number | null
  max_concurrency?: number | null
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
  input_value?: string | null
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
