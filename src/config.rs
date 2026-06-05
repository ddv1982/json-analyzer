use serde::{Deserialize, Serialize};

/// Typed desktop/service configuration for the JSON Analyzer MVP.
///
/// The service is constructed with this model directly, so desktop callers can
/// manage configuration through application state instead of relying on runtime
/// environment variables.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct AppConfig {
    pub limits: LimitsConfig,
    pub validation: ValidationConfig,
    pub features: FeatureFlagsConfig,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct LimitsConfig {
    pub max_json_bytes: usize,
    pub max_json_depth: usize,
    pub values_explorer: ValuesExplorerLimitsConfig,
    pub duplicates: DuplicateLimitsConfig,
    pub curl: CurlLimitsConfig,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ValuesExplorerLimitsConfig {
    pub max_selected_fields: usize,
    pub default_page_size: usize,
    pub page_sizes: Vec<usize>,
    pub max_page_size: usize,
    pub max_parent_items_per_group: usize,
    pub max_match_combinations_per_record: usize,
    pub max_match_combinations_per_request: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DuplicateLimitsConfig {
    pub composite_min_fields: usize,
    pub composite_max_fields: usize,
    pub default_page_size: usize,
    pub max_page_size: usize,
    pub max_match_combinations_per_record: usize,
    pub max_match_combinations_per_request: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CurlLimitsConfig {
    pub enabled: bool,
    pub default_timeout_ms: u64,
    pub max_timeout_ms: u64,
    pub max_response_bytes: usize,
    pub max_batch_size: usize,
    pub large_batch_confirmation_threshold: usize,
    pub allow_private_networks_by_default: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FeatureFlagsConfig {
    pub values_explorer: bool,
    pub advanced_duplicates: bool,
    pub pdf_export: bool,
    pub curl_executor: bool,
    pub curl_single_request_execution: bool,
    pub curl_jobs: bool,
    pub curl_batch: bool,
    pub curl_cancel: bool,
    pub metrics_ui: bool,
    pub http_openapi_adapter: bool,
    pub sqlite_curl_jobs: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ValidationConfig {
    pub schema_json: Option<String>,
    pub schema_path: Option<String>,
    pub enforcement: SchemaEnforcement,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SchemaEnforcement {
    Disabled,
    Warn,
    Error,
}

impl Default for LimitsConfig {
    fn default() -> Self {
        Self {
            max_json_bytes: 16 * 1024 * 1024,
            max_json_depth: crate::parser::DEFAULT_MAX_JSON_DEPTH,
            values_explorer: ValuesExplorerLimitsConfig::default(),
            duplicates: DuplicateLimitsConfig::default(),
            curl: CurlLimitsConfig::default(),
        }
    }
}

impl Default for ValuesExplorerLimitsConfig {
    fn default() -> Self {
        Self {
            max_selected_fields: 5,
            default_page_size: 25,
            page_sizes: vec![10, 25, 50, 100],
            max_page_size: 100,
            max_parent_items_per_group: 100,
            max_match_combinations_per_record:
                crate::analysis::values::VALUES_MAX_MATCH_COMBINATIONS_PER_RECORD,
            max_match_combinations_per_request:
                crate::analysis::values::VALUES_MAX_MATCH_COMBINATIONS_PER_REQUEST,
        }
    }
}

impl Default for DuplicateLimitsConfig {
    fn default() -> Self {
        Self {
            composite_min_fields: 2,
            composite_max_fields: 5,
            default_page_size: 25,
            max_page_size: 100,
            max_match_combinations_per_record:
                crate::analysis::duplicates::DUPLICATES_MAX_MATCH_COMBINATIONS_PER_RECORD,
            max_match_combinations_per_request:
                crate::analysis::duplicates::DUPLICATES_MAX_MATCH_COMBINATIONS_PER_REQUEST,
        }
    }
}

impl Default for CurlLimitsConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            default_timeout_ms: 30_000,
            max_timeout_ms: 120_000,
            max_response_bytes: 1_048_576,
            max_batch_size: 100,
            large_batch_confirmation_threshold: 20,
            allow_private_networks_by_default: false,
        }
    }
}

impl Default for FeatureFlagsConfig {
    fn default() -> Self {
        Self {
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
        }
    }
}

impl Default for ValidationConfig {
    fn default() -> Self {
        Self {
            schema_json: None,
            schema_path: None,
            enforcement: SchemaEnforcement::Disabled,
        }
    }
}
