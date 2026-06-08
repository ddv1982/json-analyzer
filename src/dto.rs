use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use crate::{
    AppConfig, ExactDuplicatesResult, FieldDuplicatesResult, FieldPattern, MinMaxFilledResult,
    StatisticsAnalysis, StructureAnalysis,
};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ValidateRequest {
    pub json_string: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ValidateResponse {
    pub valid: bool,
    pub document_count: usize,
    pub compact_json: String,
    pub warnings: Vec<ValidationWarning>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ValidationWarning {
    pub warning_type: String,
    pub detail: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FormatRequest {
    pub json_string: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FormatResponse {
    pub formatted_json: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AnalyzeRequest {
    pub json_string: String,
    #[serde(default = "default_min_max_deep")]
    pub min_max_deep: bool,
    /// Source parity option: when true and the analysis root is a list of lists,
    /// flatten exactly one array level before running analyzers. Validation and
    /// non-list-of-lists analysis inputs are unchanged.
    #[serde(default)]
    pub flatten: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AnalysisResponse {
    pub structure: StructureAnalysis,
    pub statistics: StatisticsAnalysis,
    pub fields: Vec<FieldPattern>,
    pub exact_duplicates: ExactDuplicatesResult,
    pub min_max_filled: MinMaxFilledResult,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GetFieldsRequest {
    pub json_string: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FieldsResponse {
    pub fields: Vec<FieldPattern>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FindDuplicatesRequest {
    pub json_string: String,
    /// When omitted, exact duplicate analysis is performed on the best array
    /// candidate. When provided, field duplicate analysis is performed against
    /// the normalized pattern, for example `users.[].email` or `[].department`.
    pub field_path: Option<String>,
    #[serde(default = "default_case_sensitive")]
    pub case_sensitive: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum DuplicatesResponse {
    Exact { result: ExactDuplicatesResult },
    Field { result: FieldDuplicatesResult },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MinMaxRequest {
    pub json_string: String,
    #[serde(default = "default_min_max_deep")]
    pub deep: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ConfigResponse {
    pub config: AppConfig,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct HealthResponse {
    pub status: String,
    pub app: String,
    pub version: String,
}

/// Shared 1-based pagination contract for parity operations.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct PaginationRequest {
    pub page: usize,
    pub page_size: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct PaginationResponse {
    pub page: usize,
    pub page_size: usize,
    pub total_items: usize,
    pub total_pages: usize,
    pub has_next_page: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SortDirection {
    Asc,
    Desc,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ValuesSortBy {
    Count,
    Value,
    FirstSourcePath,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct ValuesSort {
    pub by: ValuesSortBy,
    pub direction: SortDirection,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ParentItem {
    pub record_index: usize,
    pub source_path: Option<String>,
    pub summary: BTreeMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ValuesFieldDiscoveryRequest {
    pub json_string: String,
    pub search: Option<String>,
    pub limit: Option<usize>,
    #[serde(default)]
    pub flatten: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ValuesFieldDiscoveryResponse {
    pub fields: Vec<ValuesFieldInfo>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ValuesFieldInfo {
    pub field_path: String,
    pub label: String,
    pub type_hints: Vec<String>,
    pub non_null_count: usize,
    pub null_count: usize,
    pub missing_count: usize,
    pub unique_value_count: usize,
    pub sample_values: Vec<serde_json::Value>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ValuesAnalysisRequest {
    pub json_string: String,
    pub selected_fields: Vec<String>,
    pub search: Option<String>,
    pub sort: ValuesSort,
    pub page: usize,
    pub page_size: usize,
    #[serde(default)]
    pub include_parent_items: bool,
    #[serde(default)]
    pub flatten: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ValuesAnalysisResponse {
    pub selected_fields: Vec<String>,
    pub total_groups: usize,
    pub page: usize,
    pub page_size: usize,
    pub has_next_page: bool,
    pub groups: Vec<ValuesGroup>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ValuesGroup {
    pub key: Vec<serde_json::Value>,
    pub display_value: String,
    pub count: usize,
    pub source_paths: Vec<String>,
    pub record_indexes: Vec<usize>,
    pub parent_items: Vec<ParentItem>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ValuesExplorerSortMode {
    Frequency,
    Alphabetical,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ValuesExplorerFilterMatchMode {
    Contains,
    Exact,
}

fn default_values_filter_match_mode() -> ValuesExplorerFilterMatchMode {
    ValuesExplorerFilterMatchMode::Contains
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ValuesExplorerFilter {
    pub field_path: String,
    pub value: String,
    #[serde(default = "default_values_filter_match_mode")]
    pub match_mode: ValuesExplorerFilterMatchMode,
    #[serde(default = "default_case_sensitive")]
    pub case_sensitive: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ValuesExplorerAnalysisRequest {
    pub json_string: String,
    pub selected_fields: Vec<String>,
    pub filter: Option<ValuesExplorerFilter>,
    #[serde(default = "default_values_explorer_sort_mode")]
    pub sort_mode: ValuesExplorerSortMode,
    /// Page for duplicate value groups.
    pub page: usize,
    /// Optional page for the all-results value groups. Defaults to `page` for
    /// callers that only know about the older single-page request shape.
    #[serde(default)]
    pub groups_page: Option<usize>,
    pub page_size: usize,
    #[serde(default)]
    pub flatten: bool,
}

fn default_values_explorer_sort_mode() -> ValuesExplorerSortMode {
    ValuesExplorerSortMode::Frequency
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ValuesExplorerAnalysisResponse {
    pub field_path: String,
    pub field_paths: Vec<String>,
    pub is_composite: bool,
    pub total_items: usize,
    pub unique_values: usize,
    pub duplicate_group_count: usize,
    pub has_duplicates: bool,
    pub duplicates: Vec<ValuesExplorerGroup>,
    pub all_field_values: Vec<ValuesExplorerGroup>,
    pub page: usize,
    pub page_size: usize,
    pub total_pages: usize,
    pub has_next_page: bool,
    pub groups_page: usize,
    pub groups_total_pages: usize,
    pub sort_mode: ValuesExplorerSortMode,
    pub filter: Option<ValuesExplorerFilter>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ValuesExplorerGroup {
    pub value: serde_json::Value,
    pub display_value: String,
    pub count: usize,
    pub is_duplicate: bool,
    pub items: Vec<ValuesExplorerItem>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ValuesExplorerItem {
    pub index: usize,
    pub item: serde_json::Value,
    pub source_path: Option<String>,
    pub field_value: serde_json::Value,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DuplicateFilter {
    pub field_path: String,
    pub value: serde_json::Value,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AdvancedFieldDuplicatesRequest {
    pub json_string: String,
    pub field_path: String,
    pub filter: Option<DuplicateFilter>,
    #[serde(default = "default_case_sensitive")]
    pub case_sensitive: bool,
    #[serde(default)]
    pub include_parent_items: bool,
    pub page: usize,
    pub page_size: usize,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AdvancedFieldDuplicatesResponse {
    pub field_path: String,
    pub total_items_considered: usize,
    pub duplicate_group_count: usize,
    pub page: usize,
    pub page_size: usize,
    pub has_next_page: bool,
    pub duplicates: Vec<AdvancedFieldDuplicateGroup>,
    pub all_values_summary: Vec<DuplicateValueSummary>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AdvancedFieldDuplicateGroup {
    pub value: serde_json::Value,
    pub display_value: String,
    pub count: usize,
    pub record_indexes: Vec<usize>,
    pub source_paths: Vec<String>,
    pub parent_items: Vec<ParentItem>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DuplicateValueSummary {
    pub value: serde_json::Value,
    pub display_value: String,
    pub count: usize,
    pub is_duplicate: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CompositeDuplicatesRequest {
    pub json_string: String,
    pub field_paths: Vec<String>,
    pub filter: Option<DuplicateFilter>,
    #[serde(default = "default_case_sensitive")]
    pub case_sensitive: bool,
    #[serde(default)]
    pub include_parent_items: bool,
    pub page: usize,
    pub page_size: usize,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CompositeDuplicatesResponse {
    pub field_paths: Vec<String>,
    pub duplicate_group_count: usize,
    pub page: usize,
    pub page_size: usize,
    pub has_next_page: bool,
    pub duplicates: Vec<CompositeDuplicateGroup>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CompositeDuplicateGroup {
    pub key: Vec<serde_json::Value>,
    pub count: usize,
    pub record_indexes: Vec<usize>,
    pub source_paths: Vec<String>,
    pub parent_items: Vec<ParentItem>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CurlParseRequest {
    pub curl: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CurlParseResponse {
    pub parsed: ParsedCurlPreview,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ParsedCurlPreview {
    pub method: String,
    pub url: String,
    pub headers: Vec<CurlHeader>,
    pub body: Option<String>,
    pub body_kind: Option<CurlBodyKind>,
    pub auth: CurlAuthPreview,
    pub supported_options: Vec<String>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CurlHeader {
    pub name: String,
    pub value: String,
    pub redacted: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CurlBodyKind {
    JsonString,
    FormString,
    RawString,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CurlAuthPreview {
    pub bearer_token_present: bool,
    pub scheme: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CurlExecuteRequest {
    pub curl: String,
    pub timeout_ms: Option<u64>,
    pub follow_redirects: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CurlExecuteResponse {
    pub request_preview: ParsedCurlPreview,
    pub guardrail: CurlGuardrailDecision,
    pub response: Option<CurlHttpResponse>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CurlGuardrailRequest {
    pub method: String,
    pub url: String,
    #[serde(default)]
    pub redirect_target: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CurlGuardrailResponse {
    pub decision: CurlGuardrailDecision,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CurlGuardrailDecision {
    pub allowed: bool,
    pub reason: String,
    pub error_type: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CurlHttpResponse {
    pub status: u16,
    pub status_text: Option<String>,
    pub headers: Vec<CurlHeader>,
    pub body: String,
    pub body_truncated: bool,
    pub elapsed_ms: u64,
    pub response_bytes: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CurlStartJobRequest {
    pub curl: String,
    #[serde(default)]
    pub placeholder: Option<String>,
    #[serde(default)]
    pub values: Vec<String>,
    pub timeout_ms: Option<u64>,
    #[serde(default)]
    pub max_concurrency: Option<usize>,
    pub follow_redirects: bool,
    pub confirm_large_batch: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CurlJobResponse {
    pub job: CurlJobSummary,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CurlJobSummary {
    pub job_id: String,
    pub status: CurlJobStatus,
    pub total_requests: usize,
    pub completed_requests: usize,
    pub failed_requests: usize,
    pub canceled_requests: usize,
    pub created_at_utc: String,
    pub updated_at_utc: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CurlJobStatus {
    Queued,
    Running,
    Succeeded,
    Failed,
    Canceled,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CurlJobResultsResponse {
    pub job: CurlJobSummary,
    pub results: Vec<CurlJobResult>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CurlJobRequest {
    pub job_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CurlJobResult {
    pub index: usize,
    pub status: CurlJobStatus,
    #[serde(default)]
    pub input_value: Option<String>,
    pub request_preview: Option<ParsedCurlPreview>,
    pub response: Option<CurlHttpResponse>,
    pub error: Option<SerializableProblem>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SerializableProblem {
    pub error_type: String,
    pub title: String,
    pub status: u16,
    pub detail: String,
    pub invalid_params: Vec<SerializableInvalidParam>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SerializableInvalidParam {
    pub name: String,
    pub reason: String,
}

fn default_case_sensitive() -> bool {
    true
}

fn default_min_max_deep() -> bool {
    true
}
