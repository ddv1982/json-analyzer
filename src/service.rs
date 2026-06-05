use crate::analysis::values::{
    ValuesCombinationLimitScope, ValuesExplorerAnalysisOptions, cap_parent_items_per_group,
    cap_values_explorer_items_per_group, validate_values_combination_limits,
    validate_values_explorer_composite_unambiguous,
};
mod validation;

use crate::{
    AdvancedFieldDuplicatesRequest, AdvancedFieldDuplicatesResponse, AnalysisResponse,
    AnalyzeRequest, AppConfig, AppError, CompositeDuplicatesRequest, CompositeDuplicatesResponse,
    ConfigResponse, CurlExecuteRequest, CurlExecuteResponse, CurlGuardrailRequest,
    CurlGuardrailResponse, CurlJobRequest, CurlJobResponse, CurlJobResultsResponse,
    CurlParseRequest, CurlParseResponse, CurlStartJobRequest, DuplicateCombinationLimitScope,
    DuplicatesResponse, FieldsResponse, FindDuplicatesRequest, FormatRequest, FormatResponse,
    GetFieldsRequest, HealthResponse, JsonValue, MinMaxFilledResult, MinMaxRequest,
    SchemaEnforcement, ValidateRequest, ValidateResponse, ValuesAnalysisRequest,
    ValuesAnalysisResponse, ValuesExplorerAnalysisRequest, ValuesExplorerAnalysisResponse,
    ValuesFieldDiscoveryRequest, ValuesFieldDiscoveryResponse, analyze_advanced_field_duplicates,
    analyze_composite_duplicates, analyze_exact_duplicates, analyze_field_duplicates,
    analyze_min_max_filled, analyze_statistics, analyze_structure, analyze_values,
    analyze_values_explorer, collect_field_patterns, discover_values_fields,
    evaluate_guardrail_with_redirect, execute_curl_request, flatten,
    flatten_one_level_if_list_of_lists, parse_curl, parse_json_with_max_depth,
    validate_duplicate_combination_limits,
};
use validation::{
    validate_advanced_field_duplicates_request, validate_composite_duplicates_request,
    validate_curl_guardrail_request, validate_values_explorer_request, validate_values_request,
};

#[derive(Debug, Clone, Default)]
pub struct JsonAnalyzerService {
    config: AppConfig,
    curl_jobs: crate::curl::CurlJobManager,
}

impl JsonAnalyzerService {
    #[must_use]
    pub fn new(config: AppConfig) -> Self {
        Self {
            config,
            curl_jobs: crate::curl::CurlJobManager::new(),
        }
    }

    #[must_use]
    pub fn config(&self) -> &AppConfig {
        &self.config
    }

    pub fn validate(&self, request: ValidateRequest) -> Result<ValidateResponse, AppError> {
        let value = self.parse_json_string(&request.json_string)?;
        Ok(ValidateResponse {
            valid: true,
            document_count: 1,
            compact_json: value.compact_json(),
            warnings: Vec::new(),
        })
    }

    pub fn format_json(&self, request: FormatRequest) -> Result<FormatResponse, AppError> {
        let value = self.parse_json_string(&request.json_string)?;
        Ok(FormatResponse {
            formatted_json: value.pretty_json(),
        })
    }

    pub fn analyze(&self, request: AnalyzeRequest) -> Result<AnalysisResponse, AppError> {
        let analysis_value =
            self.parse_json_string_with_optional_flatten(&request.json_string, request.flatten)?;

        Ok(AnalysisResponse {
            structure: analyze_structure(&analysis_value),
            statistics: analyze_statistics(&analysis_value),
            fields: collect_field_patterns(&flatten(&analysis_value)),
            exact_duplicates: analyze_exact_duplicates(&analysis_value),
            min_max_filled: analyze_min_max_filled(&analysis_value, request.min_max_deep),
        })
    }

    pub fn get_fields(&self, request: GetFieldsRequest) -> Result<FieldsResponse, AppError> {
        let value = self.parse_json_string(&request.json_string)?;
        Ok(FieldsResponse {
            fields: collect_field_patterns(&flatten(&value)),
        })
    }

    pub fn find_duplicates(
        &self,
        request: FindDuplicatesRequest,
    ) -> Result<DuplicatesResponse, AppError> {
        let value = self.parse_json_string(&request.json_string)?;
        match request.field_path {
            Some(field_path) => {
                let field_path = field_path.trim();
                if field_path.is_empty() {
                    return Err(AppError::invalid_request(
                        "field_path",
                        "field_path cannot be empty when provided",
                    ));
                }
                Ok(DuplicatesResponse::Field {
                    result: analyze_field_duplicates(&value, field_path, request.case_sensitive),
                })
            }
            None => Ok(DuplicatesResponse::Exact {
                result: analyze_exact_duplicates(&value),
            }),
        }
    }

    pub fn analyze_advanced_field_duplicates(
        &self,
        request: AdvancedFieldDuplicatesRequest,
    ) -> Result<AdvancedFieldDuplicatesResponse, AppError> {
        self.validate_advanced_duplicates_enabled()?;
        validate_advanced_field_duplicates_request(&request, &self.config.limits.duplicates)?;
        let value = self.parse_json_string(&request.json_string)?;
        Ok(analyze_advanced_field_duplicates(
            &value,
            request.field_path.trim(),
            request.filter.as_ref(),
            request.case_sensitive,
            request.include_parent_items,
            request.page,
            request.page_size,
        ))
    }

    pub fn analyze_composite_duplicates(
        &self,
        request: CompositeDuplicatesRequest,
    ) -> Result<CompositeDuplicatesResponse, AppError> {
        self.validate_advanced_duplicates_enabled()?;
        let field_paths =
            validate_composite_duplicates_request(&request, &self.config.limits.duplicates)?;
        let value = self.parse_json_string(&request.json_string)?;
        if let Err(limit_error) = validate_duplicate_combination_limits(
            &value,
            &field_paths,
            self.config
                .limits
                .duplicates
                .max_match_combinations_per_record,
            self.config
                .limits
                .duplicates
                .max_match_combinations_per_request,
        ) {
            let scope = match limit_error.scope {
                DuplicateCombinationLimitScope::Record { record_index } => {
                    format!("record {record_index}")
                }
                DuplicateCombinationLimitScope::Request => "request".to_string(),
            };
            return Err(AppError::invalid_request(
                "field_paths",
                format!(
                    "Duplicate match combinations exceed limit of {} for {} ({} combinations); narrow selected fields or choose less-repeated fields",
                    limit_error.limit, scope, limit_error.combination_count
                ),
            ));
        }

        Ok(analyze_composite_duplicates(
            &value,
            &field_paths,
            request.filter.as_ref(),
            request.case_sensitive,
            request.include_parent_items,
            request.page,
            request.page_size,
        ))
    }

    pub fn min_max_filled(&self, request: MinMaxRequest) -> Result<MinMaxFilledResult, AppError> {
        let value = self.parse_json_string(&request.json_string)?;
        Ok(analyze_min_max_filled(&value, request.deep))
    }

    pub fn discover_values_fields(
        &self,
        request: ValuesFieldDiscoveryRequest,
    ) -> Result<ValuesFieldDiscoveryResponse, AppError> {
        self.validate_values_explorer_enabled()?;
        if request.limit == Some(0) {
            return Err(AppError::invalid_request(
                "limit",
                "limit must be greater than or equal to 1 when provided",
            ));
        }

        let value =
            self.parse_json_string_with_optional_flatten(&request.json_string, request.flatten)?;
        Ok(discover_values_fields(
            &value,
            request.search.as_deref(),
            request.limit,
        ))
    }

    pub fn analyze_values(
        &self,
        request: ValuesAnalysisRequest,
    ) -> Result<ValuesAnalysisResponse, AppError> {
        self.validate_values_explorer_enabled()?;
        let selected_fields =
            validate_values_request(&request, &self.config.limits.values_explorer)?;
        let value =
            self.parse_json_string_with_optional_flatten(&request.json_string, request.flatten)?;
        if let Err(limit_error) = validate_values_combination_limits(
            &value,
            &selected_fields,
            self.config
                .limits
                .values_explorer
                .max_match_combinations_per_record,
            self.config
                .limits
                .values_explorer
                .max_match_combinations_per_request,
        ) {
            let scope = match limit_error.scope {
                ValuesCombinationLimitScope::Record { record_index } => {
                    format!("record {record_index}")
                }
                ValuesCombinationLimitScope::Request => "request".to_string(),
            };
            return Err(AppError::invalid_request(
                "selected_fields",
                format!(
                    "Values Explorer match combinations exceed limit of {} for {} ({} combinations); narrow selected fields or choose less-repeated fields",
                    limit_error.limit, scope, limit_error.combination_count
                ),
            ));
        }

        Ok(cap_parent_items_per_group(
            analyze_values(
                &value,
                &selected_fields,
                request.search.as_deref(),
                request.sort,
                request.page,
                request.page_size,
                request.include_parent_items,
            ),
            self.config
                .limits
                .values_explorer
                .max_parent_items_per_group,
        ))
    }

    pub fn analyze_values_explorer(
        &self,
        request: ValuesExplorerAnalysisRequest,
    ) -> Result<ValuesExplorerAnalysisResponse, AppError> {
        self.validate_values_explorer_enabled()?;
        let selected_fields =
            validate_values_explorer_request(&request, &self.config.limits.values_explorer)?;
        let groups_page = request.groups_page.unwrap_or(request.page);
        let value =
            self.parse_json_string_with_optional_flatten(&request.json_string, request.flatten)?;
        if let Err(limit_error) = validate_values_combination_limits(
            &value,
            &selected_fields,
            self.config
                .limits
                .values_explorer
                .max_match_combinations_per_record,
            self.config
                .limits
                .values_explorer
                .max_match_combinations_per_request,
        ) {
            let scope = match limit_error.scope {
                ValuesCombinationLimitScope::Record { record_index } => {
                    format!("record {record_index}")
                }
                ValuesCombinationLimitScope::Request => "request".to_string(),
            };
            return Err(AppError::invalid_request(
                "selected_fields",
                format!(
                    "Values Explorer match combinations exceed limit of {} for {} ({} combinations); narrow selected fields or choose less-repeated fields",
                    limit_error.limit, scope, limit_error.combination_count
                ),
            ));
        }
        if let Err(ambiguity_error) =
            validate_values_explorer_composite_unambiguous(&value, &selected_fields)
        {
            return Err(AppError::invalid_request(
                "selected_fields",
                format!(
                    "Selected fields are ambiguous for composite matching ({} values found in record {} for '{}'); choose fields with one value per record scope",
                    ambiguity_error.match_count,
                    ambiguity_error.record_index,
                    ambiguity_error.field_path
                ),
            ));
        }

        Ok(cap_values_explorer_items_per_group(
            analyze_values_explorer(
                &value,
                &selected_fields,
                request.filter.as_ref(),
                ValuesExplorerAnalysisOptions {
                    sort_mode: request.sort_mode,
                    page: request.page,
                    groups_page,
                    page_size: request.page_size,
                    max_items_per_group: self
                        .config
                        .limits
                        .values_explorer
                        .max_parent_items_per_group,
                },
            ),
            self.config
                .limits
                .values_explorer
                .max_parent_items_per_group,
        ))
    }

    pub fn parse_curl(&self, request: CurlParseRequest) -> Result<CurlParseResponse, AppError> {
        self.validate_curl_executor_enabled()?;
        Ok(CurlParseResponse {
            parsed: parse_curl(&request.curl)?,
        })
    }

    pub fn validate_curl_guardrail(
        &self,
        request: CurlGuardrailRequest,
    ) -> Result<CurlGuardrailResponse, AppError> {
        self.validate_curl_executor_enabled()?;
        validate_curl_guardrail_request(&request)?;
        Ok(CurlGuardrailResponse {
            decision: evaluate_guardrail_with_redirect(
                request.url.trim(),
                request.redirect_target.as_deref().map(str::trim),
                self.config.limits.curl.allow_private_networks_by_default,
            ),
        })
    }

    pub fn execute_curl(
        &self,
        request: CurlExecuteRequest,
    ) -> Result<CurlExecuteResponse, AppError> {
        self.validate_curl_executor_enabled()?;
        if !self.config.features.curl_single_request_execution {
            return Err(AppError::unsupported_config(
                "features.curl_single_request_execution",
                "curl single-request execution is disabled by configuration",
            ));
        }
        execute_curl_request(request, &self.config.limits.curl)
    }

    pub fn start_curl_job(
        &self,
        request: CurlStartJobRequest,
    ) -> Result<CurlJobResponse, AppError> {
        self.validate_curl_job_features(request.curls.len())?;
        self.curl_jobs
            .start_job(request, self.config.limits.curl.clone())
    }

    pub fn get_curl_job_results(
        &self,
        request: CurlJobRequest,
    ) -> Result<CurlJobResultsResponse, AppError> {
        self.validate_curl_executor_enabled()?;
        if !self.config.features.curl_jobs {
            return Err(AppError::unsupported_config(
                "features.curl_jobs",
                "curl async jobs are disabled by configuration",
            ));
        }
        self.curl_jobs.get_job_results(request)
    }

    pub fn cancel_curl_job(&self, request: CurlJobRequest) -> Result<CurlJobResponse, AppError> {
        self.validate_curl_executor_enabled()?;
        if !self.config.features.curl_cancel {
            return Err(AppError::unsupported_config(
                "features.curl_cancel",
                "curl job cancellation is disabled by configuration",
            ));
        }
        self.curl_jobs.cancel_job(request)
    }

    pub fn get_config(&self) -> Result<ConfigResponse, AppError> {
        Ok(ConfigResponse {
            config: self.config.clone(),
        })
    }

    pub fn get_health(&self) -> Result<HealthResponse, AppError> {
        Ok(HealthResponse {
            status: "ok".to_string(),
            app: "json-analyzer".to_string(),
            version: env!("CARGO_PKG_VERSION").to_string(),
        })
    }

    fn parse_json_string(&self, json_string: &str) -> Result<JsonValue, AppError> {
        self.validate_supported_config()?;
        self.validate_json_string(json_string)?;
        parse_json_with_max_depth(json_string, self.config.limits.max_json_depth).map_err(|error| {
            if error.is_depth_exceeded() {
                AppError::json_too_deep(self.config.limits.max_json_depth)
            } else {
                AppError::parse(&error)
            }
        })
    }

    fn parse_json_string_with_optional_flatten(
        &self,
        json_string: &str,
        should_flatten: bool,
    ) -> Result<JsonValue, AppError> {
        let parsed_value = self.parse_json_string(json_string)?;
        if should_flatten {
            Ok(flatten_one_level_if_list_of_lists(&parsed_value)
                .unwrap_or_else(|| parsed_value.clone()))
        } else {
            Ok(parsed_value)
        }
    }

    fn validate_supported_config(&self) -> Result<(), AppError> {
        if self.config.validation.schema_json.is_some() {
            return Err(AppError::unsupported_config(
                "validation.schema_json",
                "schema validation is deferred for the MVP service contract",
            ));
        }

        if self.config.validation.schema_path.is_some() {
            return Err(AppError::unsupported_config(
                "validation.schema_path",
                "schema validation is deferred for the MVP service contract",
            ));
        }

        if self.config.validation.enforcement != SchemaEnforcement::Disabled {
            return Err(AppError::unsupported_config(
                "validation.enforcement",
                "schema validation enforcement is deferred for the MVP service contract",
            ));
        }

        Ok(())
    }

    fn validate_values_explorer_enabled(&self) -> Result<(), AppError> {
        if !self.config.features.values_explorer {
            return Err(AppError::unsupported_config(
                "features.values_explorer",
                "values explorer is disabled by configuration",
            ));
        }
        Ok(())
    }

    fn validate_advanced_duplicates_enabled(&self) -> Result<(), AppError> {
        if !self.config.features.advanced_duplicates {
            return Err(AppError::unsupported_config(
                "features.advanced_duplicates",
                "advanced duplicate analysis is disabled by configuration",
            ));
        }
        Ok(())
    }

    fn validate_curl_executor_enabled(&self) -> Result<(), AppError> {
        if !self.config.features.curl_executor {
            return Err(AppError::unsupported_config(
                "features.curl_executor",
                "curl executor is disabled by configuration",
            ));
        }
        if !self.config.limits.curl.enabled {
            return Err(AppError::unsupported_config(
                "limits.curl.enabled",
                "curl execution is disabled by configuration",
            ));
        }
        Ok(())
    }

    fn validate_curl_job_features(&self, request_count: usize) -> Result<(), AppError> {
        self.validate_curl_executor_enabled()?;
        if !self.config.features.curl_jobs {
            return Err(AppError::unsupported_config(
                "features.curl_jobs",
                "curl async jobs are disabled by configuration",
            ));
        }
        if request_count == 1 && !self.config.features.curl_single_request_execution {
            return Err(AppError::unsupported_config(
                "features.curl_single_request_execution",
                "curl single-request execution is disabled by configuration",
            ));
        }
        if request_count > 1 && !self.config.features.curl_batch {
            return Err(AppError::unsupported_config(
                "features.curl_batch",
                "curl batch execution is disabled by configuration",
            ));
        }
        Ok(())
    }

    fn validate_json_string(&self, json_string: &str) -> Result<(), AppError> {
        if json_string.is_empty() {
            return Err(AppError::invalid_request(
                "json_string",
                "json_string cannot be empty",
            ));
        }

        if json_string.len() > self.config.limits.max_json_bytes {
            return Err(AppError::json_too_large(self.config.limits.max_json_bytes));
        }

        Ok(())
    }
}
#[cfg(test)]
mod tests {
    use super::JsonAnalyzerService;

    #[test]
    fn health_reports_scaffold_status() {
        let response = JsonAnalyzerService::default().get_health().unwrap();

        assert_eq!(response.status, "ok");
        assert_eq!(response.app, "json-analyzer");
        assert!(!response.version.is_empty());
    }
}
