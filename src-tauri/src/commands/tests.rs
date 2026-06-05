use super::{
    AdvancedFieldDuplicatesRequest, AnalyzeRequest, CompositeDuplicatesRequest, CurlExecuteRequest,
    CurlGuardrailRequest, CurlJobRequest, CurlParseRequest, CurlStartJobRequest,
    FindDuplicatesRequest, FormatRequest, GetFieldsRequest, MinMaxRequest, REQUIRED_COMMANDS,
    ValidateRequest, ValuesAnalysisRequest, ValuesFieldDiscoveryRequest,
    analyze_advanced_field_duplicates_with_service, analyze_composite_duplicates_with_service,
    analyze_json_with_service, analyze_values_with_service, cancel_curl_job_with_service,
    discover_values_fields_with_service, execute_curl_with_service, find_duplicates_with_service,
    format_json_with_service, get_config_with_service, get_curl_job_results_with_service,
    get_fields_with_service, get_health_with_service, min_max_filled_with_service,
    parse_curl_with_service, start_curl_job_with_service, validate_curl_guardrail_with_service,
    validate_json_with_service,
};
use json_analyzer::{
    AppConfig, CurlJobResultsResponse, CurlJobStatus, DuplicateFilter, DuplicatesResponse,
    JsonAnalyzerService, SortDirection, ValuesSort, ValuesSortBy,
};

fn wait_for_curl_job_results(
    service: &JsonAnalyzerService,
    job_id: &str,
) -> CurlJobResultsResponse {
    for _ in 0..50 {
        let results = get_curl_job_results_with_service(
            service,
            CurlJobRequest {
                job_id: job_id.to_string(),
            },
        )
        .unwrap();
        if matches!(
            results.job.status,
            CurlJobStatus::Succeeded | CurlJobStatus::Failed | CurlJobStatus::Canceled
        ) {
            return results;
        }
        std::thread::sleep(std::time::Duration::from_millis(10));
    }
    panic!("curl job did not reach terminal state");
}

const STRUCTURE_INPUT: &str = r#"{
  "users": [
    { "id": 1, "name": "Alice", "department": "Engineering" },
    { "id": 2, "name": "Bob", "department": "Engineering" },
    { "id": 3, "name": "Carol", "department": "Design" }
  ]
}"#;

#[test]
fn command_helpers_call_managed_core_service_for_success_responses() {
    let service = JsonAnalyzerService::default();

    let validation = validate_json_with_service(
        &service,
        ValidateRequest {
            json_string: r#"{"ok":true}"#.to_string(),
        },
    )
    .unwrap();
    assert!(validation.valid);

    let formatted = format_json_with_service(
        &service,
        FormatRequest {
            json_string: r#"{"id":1,"id":2}"#.to_string(),
        },
    )
    .unwrap();
    assert_eq!(formatted.formatted_json, "{\n  \"id\": 1,\n  \"id\": 2\n}");

    let analysis = analyze_json_with_service(
        &service,
        AnalyzeRequest {
            json_string: STRUCTURE_INPUT.to_string(),
            min_max_deep: true,
            flatten: false,
        },
    )
    .unwrap();
    assert_eq!(analysis.structure.value_type, "dict");
    assert!(
        analysis
            .fields
            .iter()
            .any(|field| field.pattern == "users.[].department")
    );

    let flattened_analysis = analyze_json_with_service(
        &service,
        AnalyzeRequest {
            json_string: r#"[[{"id":1}],[],[{"id":2},{"id":3}]]"#.to_string(),
            min_max_deep: true,
            flatten: true,
        },
    )
    .unwrap();
    assert_eq!(flattened_analysis.structure.size, 3);
    assert!(
        !flattened_analysis
            .structure
            .container_summary
            .is_list_of_lists
    );

    let fields = get_fields_with_service(
        &service,
        GetFieldsRequest {
            json_string: STRUCTURE_INPUT.to_string(),
        },
    )
    .unwrap();
    assert!(
        fields
            .fields
            .iter()
            .any(|field| field.pattern == "users.[].name")
    );

    let exact_duplicates = find_duplicates_with_service(
        &service,
        FindDuplicatesRequest {
            json_string: r#"[{"id":1},{"id":1},{"id":2}]"#.to_string(),
            field_path: None,
            case_sensitive: true,
        },
    )
    .unwrap();
    let DuplicatesResponse::Exact { result } = exact_duplicates else {
        panic!("expected exact duplicate response");
    };
    assert!(result.has_duplicates);

    let field_duplicates = find_duplicates_with_service(
        &service,
        FindDuplicatesRequest {
            json_string: STRUCTURE_INPUT.to_string(),
            field_path: Some("users.[].department".to_string()),
            case_sensitive: false,
        },
    )
    .unwrap();
    let DuplicatesResponse::Field { result } = field_duplicates else {
        panic!("expected field duplicate response");
    };
    assert!(result.has_duplicates);

    let min_max = min_max_filled_with_service(
        &service,
        MinMaxRequest {
            json_string: STRUCTURE_INPUT.to_string(),
            deep: true,
        },
    )
    .unwrap();
    assert!(min_max.has_records);

    let values_fields = discover_values_fields_with_service(
        &service,
        ValuesFieldDiscoveryRequest {
            json_string: STRUCTURE_INPUT.to_string(),
            search: Some("dep".to_string()),
            limit: Some(10),
            flatten: false,
        },
    )
    .unwrap();
    assert!(
        values_fields
            .fields
            .iter()
            .any(|field| field.field_path == "[].department")
    );

    let values = analyze_values_with_service(
        &service,
        ValuesAnalysisRequest {
            json_string: STRUCTURE_INPUT.to_string(),
            selected_fields: vec!["[].department".to_string()],
            search: None,
            sort: ValuesSort {
                by: ValuesSortBy::Count,
                direction: SortDirection::Desc,
            },
            page: 1,
            page_size: 10,
            include_parent_items: true,
            flatten: false,
        },
    )
    .unwrap();
    assert_eq!(values.selected_fields, vec!["[].department"]);
    assert_eq!(values.groups[0].display_value, "Engineering");

    let advanced_duplicates = analyze_advanced_field_duplicates_with_service(
        &service,
        AdvancedFieldDuplicatesRequest {
            json_string: STRUCTURE_INPUT.to_string(),
            field_path: "users.[].department".to_string(),
            filter: Some(DuplicateFilter {
                field_path: "users.[].department".to_string(),
                value: "Engineering".into(),
            }),
            case_sensitive: true,
            include_parent_items: true,
            page: 1,
            page_size: 10,
        },
    )
    .unwrap();
    assert_eq!(advanced_duplicates.field_path, "users.[].department");
    assert_eq!(advanced_duplicates.duplicate_group_count, 1);
    assert_eq!(
        advanced_duplicates.duplicates[0].display_value,
        "Engineering"
    );
    assert!(!advanced_duplicates.duplicates[0].parent_items.is_empty());

    let composite_duplicates = analyze_composite_duplicates_with_service(
        &service,
        CompositeDuplicatesRequest {
            json_string: STRUCTURE_INPUT.to_string(),
            field_paths: vec![
                "users.[].department".to_string(),
                "users.[].name".to_string(),
            ],
            filter: None,
            case_sensitive: true,
            include_parent_items: false,
            page: 1,
            page_size: 10,
        },
    )
    .unwrap();
    assert_eq!(
        composite_duplicates.field_paths,
        vec!["users.[].department", "users.[].name"]
    );

    let parsed_curl = parse_curl_with_service(
        &service,
        CurlParseRequest {
            curl: "curl -H 'Authorization: Bearer secret' -d '{\"ok\":true}' https://api.example.com/users".to_string(),
        },
    )
    .unwrap();
    assert_eq!(parsed_curl.parsed.method, "POST");
    assert_eq!(parsed_curl.parsed.url, "https://api.example.com/users");
    assert!(parsed_curl.parsed.auth.bearer_token_present);
    assert_eq!(parsed_curl.parsed.headers[0].value, "Bearer ***");

    let guardrail = validate_curl_guardrail_with_service(
        &service,
        CurlGuardrailRequest {
            method: parsed_curl.parsed.method,
            url: parsed_curl.parsed.url,
            redirect_target: None,
        },
    )
    .unwrap();
    assert!(guardrail.decision.allowed);
    assert_eq!(guardrail.decision.reason, "public_https_url");

    let execute_error = execute_curl_with_service(
        &service,
        CurlExecuteRequest {
            curl: "wget https://api.example.com".to_string(),
            timeout_ms: Some(1_000),
            follow_redirects: false,
        },
    )
    .unwrap_err();
    assert_eq!(execute_error.problem.error_type, "invalid_request");
    assert_eq!(execute_error.problem.invalid_params[0].name, "curl");

    let started_job = start_curl_job_with_service(
        &service,
        CurlStartJobRequest {
            curls: vec!["wget https://api.example.com".to_string()],
            timeout_ms: Some(1_000),
            follow_redirects: false,
            confirm_large_batch: false,
        },
    )
    .unwrap();
    let job_results = wait_for_curl_job_results(&service, &started_job.job.job_id);
    assert_eq!(job_results.job.status, CurlJobStatus::Failed);
    assert_eq!(job_results.results[0].status, CurlJobStatus::Failed);
    assert_eq!(
        job_results.results[0].error.as_ref().unwrap().error_type,
        "invalid_request"
    );

    let config = get_config_with_service(&service).unwrap();
    assert_eq!(
        config.config.limits.max_json_bytes,
        service.config().limits.max_json_bytes
    );

    let health = get_health_with_service(&service).unwrap();
    assert_eq!(health.status, "ok");
    assert_eq!(health.app, "json-analyzer");
}

#[test]
fn cancel_curl_job_helper_forwards_to_service() {
    let mut config = AppConfig::default();
    config.features.curl_cancel = false;
    let service = JsonAnalyzerService::new(config);

    let error = cancel_curl_job_with_service(
        &service,
        CurlJobRequest {
            job_id: "curl-job-test-1".to_string(),
        },
    )
    .unwrap_err();

    assert_eq!(error.problem.error_type, "unsupported_config");
    assert_eq!(error.problem.status, Some(501));
    assert_eq!(error.problem.invalid_params[0].name, "features.curl_cancel");
}

#[test]
fn command_helpers_return_serializable_service_errors() {
    let service = JsonAnalyzerService::default();

    let error = validate_json_with_service(
        &service,
        ValidateRequest {
            json_string: String::new(),
        },
    )
    .unwrap_err();

    assert_eq!(error.problem.error_type, "invalid_request");
    assert_eq!(error.problem.status, Some(400));
    assert_eq!(error.problem.invalid_params[0].name, "json_string");
}

#[test]
fn capability_allows_only_the_json_analyzer_command_permission_set() {
    let capability = include_str!("../../capabilities/default.json");
    let permissions = include_str!("../../permissions/json-analyzer-commands.toml");
    let cargo_toml = include_str!("../../Cargo.toml");
    let tauri_conf = include_str!("../../tauri.conf.json");

    assert!(capability.contains("\"permissions\": [\"json-analyzer-commands\"]"));
    assert!(!capability.contains("core:default"));
    assert!(!capability.contains("shell:"));
    assert!(!capability.contains("fs:"));
    assert!(!capability.contains("http:"));

    assert!(permissions.contains("commands.allow"));
    assert!(!permissions.contains("shell:"));
    assert!(!permissions.contains("fs:"));
    assert!(!permissions.contains("http:"));
    assert!(!permissions.contains("network:"));

    assert!(!cargo_toml.contains("tauri-plugin"));
    assert!(!cargo_toml.contains("plugin-shell"));
    assert!(!cargo_toml.contains("plugin-fs"));
    assert!(!cargo_toml.contains("plugin-http"));

    assert!(tauri_conf.contains("\"csp\": \"default-src 'self'"));
    assert!(!tauri_conf.contains("\"csp\": null"));

    for command in REQUIRED_COMMANDS {
        assert!(
            permissions.contains(&format!("\"{command}\"")),
            "missing command permission for {command}"
        );
    }
}
