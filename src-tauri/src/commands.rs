use json_analyzer::{
    AdvancedFieldDuplicatesRequest, AdvancedFieldDuplicatesResponse, AnalysisResponse,
    AnalyzeRequest, AppError, CompositeDuplicatesRequest, CompositeDuplicatesResponse,
    ConfigResponse, CurlExecuteRequest, CurlExecuteResponse, CurlGuardrailRequest,
    CurlGuardrailResponse, CurlJobRequest, CurlJobResponse, CurlJobResultsResponse,
    CurlParseRequest, CurlParseResponse, CurlStartJobRequest, DuplicatesResponse, FieldsResponse,
    FindDuplicatesRequest, FormatRequest, FormatResponse, GetFieldsRequest, HealthResponse,
    JsonAnalyzerService, MinMaxFilledResult, MinMaxRequest, ValidateRequest, ValidateResponse,
    ValuesAnalysisRequest, ValuesAnalysisResponse, ValuesFieldDiscoveryRequest,
    ValuesFieldDiscoveryResponse,
};
use tauri::State;

pub(crate) type CommandResult<T> = Result<T, AppError>;

#[cfg(test)]
const REQUIRED_COMMANDS: [&str; 18] = [
    "validate_json",
    "format_json",
    "analyze_json",
    "get_fields",
    "find_duplicates",
    "min_max_filled",
    "discover_values_fields",
    "analyze_values",
    "analyze_advanced_field_duplicates",
    "analyze_composite_duplicates",
    "parse_curl",
    "validate_curl_guardrail",
    "execute_curl",
    "start_curl_job",
    "get_curl_job_results",
    "cancel_curl_job",
    "get_config",
    "get_health",
];

#[tauri::command]
pub(crate) fn validate_json(
    service: State<'_, JsonAnalyzerService>,
    request: ValidateRequest,
) -> CommandResult<ValidateResponse> {
    validate_json_with_service(service.inner(), request)
}

#[tauri::command]
pub(crate) fn format_json(
    service: State<'_, JsonAnalyzerService>,
    request: FormatRequest,
) -> CommandResult<FormatResponse> {
    format_json_with_service(service.inner(), request)
}

#[tauri::command]
pub(crate) fn analyze_json(
    service: State<'_, JsonAnalyzerService>,
    request: AnalyzeRequest,
) -> CommandResult<AnalysisResponse> {
    analyze_json_with_service(service.inner(), request)
}

#[tauri::command]
pub(crate) fn get_fields(
    service: State<'_, JsonAnalyzerService>,
    request: GetFieldsRequest,
) -> CommandResult<FieldsResponse> {
    get_fields_with_service(service.inner(), request)
}

#[tauri::command]
pub(crate) fn find_duplicates(
    service: State<'_, JsonAnalyzerService>,
    request: FindDuplicatesRequest,
) -> CommandResult<DuplicatesResponse> {
    find_duplicates_with_service(service.inner(), request)
}

#[tauri::command]
pub(crate) fn min_max_filled(
    service: State<'_, JsonAnalyzerService>,
    request: MinMaxRequest,
) -> CommandResult<MinMaxFilledResult> {
    min_max_filled_with_service(service.inner(), request)
}

#[tauri::command]
pub(crate) fn discover_values_fields(
    service: State<'_, JsonAnalyzerService>,
    request: ValuesFieldDiscoveryRequest,
) -> CommandResult<ValuesFieldDiscoveryResponse> {
    discover_values_fields_with_service(service.inner(), request)
}

#[tauri::command]
pub(crate) fn analyze_values(
    service: State<'_, JsonAnalyzerService>,
    request: ValuesAnalysisRequest,
) -> CommandResult<ValuesAnalysisResponse> {
    analyze_values_with_service(service.inner(), request)
}

#[tauri::command]
pub(crate) fn analyze_advanced_field_duplicates(
    service: State<'_, JsonAnalyzerService>,
    request: AdvancedFieldDuplicatesRequest,
) -> CommandResult<AdvancedFieldDuplicatesResponse> {
    analyze_advanced_field_duplicates_with_service(service.inner(), request)
}

#[tauri::command]
pub(crate) fn analyze_composite_duplicates(
    service: State<'_, JsonAnalyzerService>,
    request: CompositeDuplicatesRequest,
) -> CommandResult<CompositeDuplicatesResponse> {
    analyze_composite_duplicates_with_service(service.inner(), request)
}

#[tauri::command]
pub(crate) fn parse_curl(
    service: State<'_, JsonAnalyzerService>,
    request: CurlParseRequest,
) -> CommandResult<CurlParseResponse> {
    parse_curl_with_service(service.inner(), request)
}

#[tauri::command]
pub(crate) fn validate_curl_guardrail(
    service: State<'_, JsonAnalyzerService>,
    request: CurlGuardrailRequest,
) -> CommandResult<CurlGuardrailResponse> {
    validate_curl_guardrail_with_service(service.inner(), request)
}

#[tauri::command]
pub(crate) async fn execute_curl(
    service: State<'_, JsonAnalyzerService>,
    request: CurlExecuteRequest,
) -> CommandResult<CurlExecuteResponse> {
    let service = service.inner().clone();
    tauri::async_runtime::spawn_blocking(move || execute_curl_with_service(&service, request))
        .await
        .map_err(|error| {
            AppError::new(
                "internal_error",
                "Internal error",
                Some(500),
                format!("curl execution worker failed: {error}"),
            )
        })?
}

#[tauri::command]
pub(crate) fn start_curl_job(
    service: State<'_, JsonAnalyzerService>,
    request: CurlStartJobRequest,
) -> CommandResult<CurlJobResponse> {
    start_curl_job_with_service(service.inner(), request)
}

#[tauri::command]
pub(crate) fn get_curl_job_results(
    service: State<'_, JsonAnalyzerService>,
    request: CurlJobRequest,
) -> CommandResult<CurlJobResultsResponse> {
    get_curl_job_results_with_service(service.inner(), request)
}

#[tauri::command]
pub(crate) fn cancel_curl_job(
    service: State<'_, JsonAnalyzerService>,
    request: CurlJobRequest,
) -> CommandResult<CurlJobResponse> {
    cancel_curl_job_with_service(service.inner(), request)
}

#[tauri::command]
pub(crate) fn get_config(service: State<'_, JsonAnalyzerService>) -> CommandResult<ConfigResponse> {
    get_config_with_service(service.inner())
}

#[tauri::command]
pub(crate) fn get_health(service: State<'_, JsonAnalyzerService>) -> CommandResult<HealthResponse> {
    get_health_with_service(service.inner())
}

fn validate_json_with_service(
    service: &JsonAnalyzerService,
    request: ValidateRequest,
) -> CommandResult<ValidateResponse> {
    service.validate(request)
}

fn format_json_with_service(
    service: &JsonAnalyzerService,
    request: FormatRequest,
) -> CommandResult<FormatResponse> {
    service.format_json(request)
}

fn analyze_json_with_service(
    service: &JsonAnalyzerService,
    request: AnalyzeRequest,
) -> CommandResult<AnalysisResponse> {
    service.analyze(request)
}

fn get_fields_with_service(
    service: &JsonAnalyzerService,
    request: GetFieldsRequest,
) -> CommandResult<FieldsResponse> {
    service.get_fields(request)
}

fn find_duplicates_with_service(
    service: &JsonAnalyzerService,
    request: FindDuplicatesRequest,
) -> CommandResult<DuplicatesResponse> {
    service.find_duplicates(request)
}

fn min_max_filled_with_service(
    service: &JsonAnalyzerService,
    request: MinMaxRequest,
) -> CommandResult<MinMaxFilledResult> {
    service.min_max_filled(request)
}

fn discover_values_fields_with_service(
    service: &JsonAnalyzerService,
    request: ValuesFieldDiscoveryRequest,
) -> CommandResult<ValuesFieldDiscoveryResponse> {
    service.discover_values_fields(request)
}

fn analyze_values_with_service(
    service: &JsonAnalyzerService,
    request: ValuesAnalysisRequest,
) -> CommandResult<ValuesAnalysisResponse> {
    service.analyze_values(request)
}

fn analyze_advanced_field_duplicates_with_service(
    service: &JsonAnalyzerService,
    request: AdvancedFieldDuplicatesRequest,
) -> CommandResult<AdvancedFieldDuplicatesResponse> {
    service.analyze_advanced_field_duplicates(request)
}

fn analyze_composite_duplicates_with_service(
    service: &JsonAnalyzerService,
    request: CompositeDuplicatesRequest,
) -> CommandResult<CompositeDuplicatesResponse> {
    service.analyze_composite_duplicates(request)
}

fn parse_curl_with_service(
    service: &JsonAnalyzerService,
    request: CurlParseRequest,
) -> CommandResult<CurlParseResponse> {
    service.parse_curl(request)
}

fn validate_curl_guardrail_with_service(
    service: &JsonAnalyzerService,
    request: CurlGuardrailRequest,
) -> CommandResult<CurlGuardrailResponse> {
    service.validate_curl_guardrail(request)
}

fn execute_curl_with_service(
    service: &JsonAnalyzerService,
    request: CurlExecuteRequest,
) -> CommandResult<CurlExecuteResponse> {
    service.execute_curl(request)
}

fn start_curl_job_with_service(
    service: &JsonAnalyzerService,
    request: CurlStartJobRequest,
) -> CommandResult<CurlJobResponse> {
    service.start_curl_job(request)
}

fn get_curl_job_results_with_service(
    service: &JsonAnalyzerService,
    request: CurlJobRequest,
) -> CommandResult<CurlJobResultsResponse> {
    service.get_curl_job_results(request)
}

fn cancel_curl_job_with_service(
    service: &JsonAnalyzerService,
    request: CurlJobRequest,
) -> CommandResult<CurlJobResponse> {
    service.cancel_curl_job(request)
}

fn get_config_with_service(service: &JsonAnalyzerService) -> CommandResult<ConfigResponse> {
    service.get_config()
}

fn get_health_with_service(service: &JsonAnalyzerService) -> CommandResult<HealthResponse> {
    service.get_health()
}

#[cfg(test)]
mod tests;
