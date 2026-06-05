pub mod analysis;
pub mod ast;
pub mod config;
pub mod curl;
pub mod dto;
pub mod error;
pub mod fields;
pub mod json_ops;
pub mod parser;

mod service;

pub use analysis::{
    CountDistribution, DUPLICATES_MAX_MATCH_COMBINATIONS_PER_RECORD,
    DUPLICATES_MAX_MATCH_COMBINATIONS_PER_REQUEST, DuplicateCombinationLimitError,
    DuplicateCombinationLimitScope, ExactDuplicateGroup, ExactDuplicatesResult,
    FieldDuplicateGroup, FieldDuplicateSummary, FieldDuplicatesResult, MinMaxFilledResult,
    MinMaxRecord, MinMaxStatistics, StatisticsAnalysis, StringLengthStats, StructureAnalysis,
    TypeCount, ValueDistribution, analyze_advanced_field_duplicates, analyze_composite_duplicates,
    analyze_exact_duplicates, analyze_field_duplicates, analyze_min_max_filled, analyze_statistics,
    analyze_structure, analyze_values, analyze_values_explorer, discover_values_fields,
    validate_duplicate_combination_limits, validate_values_explorer_composite_unambiguous,
};
pub use ast::{JsonNumber, JsonNumberError, JsonValue};
pub use config::{
    AppConfig, CurlLimitsConfig, DuplicateLimitsConfig, FeatureFlagsConfig, LimitsConfig,
    SchemaEnforcement, ValidationConfig, ValuesExplorerLimitsConfig,
};
pub use curl::{
    CurlHttpClient, CurlHttpClientError, CurlHttpClientResponse, CurlHttpRequest, CurlJobManager,
    ParsedCurlRequest, RawCurlHeader, ReqwestCurlHttpClient, evaluate_guardrail,
    evaluate_guardrail_with_redirect, execute_curl_request, execute_curl_request_with_client,
    parse_curl, parse_curl_request,
};
pub use dto::*;
pub use error::{AppError, ErrorPosition, InvalidParam, ProblemDetails};
pub use fields::{FieldPattern, collect_field_patterns};
pub use json_ops::{
    FlattenedEntry, flatten, flatten_one_level_if_list_of_lists, flatten_paths, path_to_pattern,
    safe_str,
};
pub use parser::{
    DEFAULT_MAX_JSON_DEPTH, ParseError, parse_json, parse_json_documents,
    parse_json_documents_with_max_depth, parse_json_with_max_depth,
};
pub use service::JsonAnalyzerService;
