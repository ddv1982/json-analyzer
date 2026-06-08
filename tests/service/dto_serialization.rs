use std::collections::BTreeMap;

use json_analyzer::*;
use serde_json::json;

#[test]
fn app_error_serializes_to_problem_details_shape() {
    let service = JsonAnalyzerService::default();
    let error = service
        .validate(ValidateRequest {
            json_string: "".to_string(),
        })
        .unwrap_err();

    let serialized = serde_json::to_value(&error).unwrap();
    assert_eq!(serialized["error_type"], "invalid_request");
    assert_eq!(serialized["title"], "Invalid request");
    assert_eq!(serialized["status"], 400);
    assert_eq!(serialized["detail"], "json_string cannot be empty");
    assert_eq!(serialized["invalid_params"][0]["name"], "json_string");
}

#[test]
fn analyze_request_serializes_flatten_option_and_supports_serde_default() {
    let request = AnalyzeRequest {
        json_string: "[]".to_string(),
        min_max_deep: false,
        flatten: true,
    };

    assert_eq!(
        serde_json::to_value(request).unwrap(),
        json!({
            "json_string": "[]",
            "min_max_deep": false,
            "flatten": true
        })
    );

    let defaulted: AnalyzeRequest = serde_json::from_value(json!({
        "json_string": "[]"
    }))
    .unwrap();
    assert!(defaulted.min_max_deep);
    assert!(!defaulted.flatten);
}

#[test]
fn values_and_duplicate_parity_dtos_serialize_to_stable_shapes() {
    let values_request = ValuesAnalysisRequest {
        json_string: "[]".to_string(),
        selected_fields: vec!["[].department".to_string()],
        search: None,
        sort: ValuesSort {
            by: ValuesSortBy::Count,
            direction: SortDirection::Desc,
        },
        page: 1,
        page_size: 25,
        include_parent_items: true,
        flatten: false,
    };
    assert_eq!(
        serde_json::to_value(values_request).unwrap(),
        json!({
            "json_string": "[]",
            "selected_fields": ["[].department"],
            "search": null,
            "sort": { "by": "count", "direction": "desc" },
            "page": 1,
            "page_size": 25,
            "include_parent_items": true,
            "flatten": false
        })
    );

    let parent = ParentItem {
        record_index: 0,
        source_path: Some("0".to_string()),
        summary: BTreeMap::from([
            ("department".to_string(), json!("Engineering")),
            ("id".to_string(), json!(1)),
        ]),
    };
    let values_response = ValuesAnalysisResponse {
        selected_fields: vec!["[].department".to_string()],
        total_groups: 1,
        page: 1,
        page_size: 25,
        has_next_page: false,
        groups: vec![ValuesGroup {
            key: vec![json!("Engineering")],
            display_value: "Engineering".to_string(),
            count: 1,
            source_paths: vec!["0.department".to_string()],
            record_indexes: vec![0],
            parent_items: vec![parent.clone()],
        }],
    };
    assert_eq!(
        serde_json::to_value(values_response).unwrap(),
        json!({
            "selected_fields": ["[].department"],
            "total_groups": 1,
            "page": 1,
            "page_size": 25,
            "has_next_page": false,
            "groups": [{
                "key": ["Engineering"],
                "display_value": "Engineering",
                "count": 1,
                "source_paths": ["0.department"],
                "record_indexes": [0],
                "parent_items": [{
                    "record_index": 0,
                    "source_path": "0",
                    "summary": { "department": "Engineering", "id": 1 }
                }]
            }]
        })
    );

    let duplicate_request = CompositeDuplicatesRequest {
        json_string: "[]".to_string(),
        field_paths: vec!["[].department".to_string(), "[].role".to_string()],
        filter: Some(DuplicateFilter {
            field_path: "[].status".to_string(),
            value: json!("active"),
        }),
        case_sensitive: false,
        include_parent_items: true,
        page: 1,
        page_size: 10,
    };
    assert_eq!(
        serde_json::to_value(duplicate_request).unwrap(),
        json!({
            "json_string": "[]",
            "field_paths": ["[].department", "[].role"],
            "filter": { "field_path": "[].status", "value": "active" },
            "case_sensitive": false,
            "include_parent_items": true,
            "page": 1,
            "page_size": 10
        })
    );

    let duplicate_response = CompositeDuplicatesResponse {
        field_paths: vec!["[].department".to_string(), "[].role".to_string()],
        duplicate_group_count: 1,
        page: 1,
        page_size: 10,
        has_next_page: false,
        duplicates: vec![CompositeDuplicateGroup {
            key: vec![json!("Engineering"), json!("Developer")],
            count: 2,
            record_indexes: vec![0, 1],
            source_paths: vec![
                "0.department".to_string(),
                "0.role".to_string(),
                "1.department".to_string(),
                "1.role".to_string(),
            ],
            parent_items: vec![parent],
        }],
    };
    assert_eq!(
        serde_json::to_value(duplicate_response).unwrap(),
        json!({
            "field_paths": ["[].department", "[].role"],
            "duplicate_group_count": 1,
            "page": 1,
            "page_size": 10,
            "has_next_page": false,
            "duplicates": [{
                "key": ["Engineering", "Developer"],
                "count": 2,
                "record_indexes": [0, 1],
                "source_paths": ["0.department", "0.role", "1.department", "1.role"],
                "parent_items": [{
                    "record_index": 0,
                    "source_path": "0",
                    "summary": { "department": "Engineering", "id": 1 }
                }]
            }]
        })
    );

    let advanced_response = AdvancedFieldDuplicatesResponse {
        field_path: "[].id".to_string(),
        total_items_considered: 3,
        duplicate_group_count: 1,
        page: 1,
        page_size: 10,
        has_next_page: false,
        duplicates: vec![AdvancedFieldDuplicateGroup {
            value: json!(1),
            display_value: "1".to_string(),
            count: 2,
            record_indexes: vec![0, 2],
            source_paths: vec!["0.id".to_string(), "2.id".to_string()],
            parent_items: vec![],
        }],
        all_values_summary: vec![DuplicateValueSummary {
            value: json!(1),
            display_value: "1".to_string(),
            count: 2,
            is_duplicate: true,
        }],
    };
    assert_eq!(
        serde_json::to_value(advanced_response).unwrap(),
        json!({
            "field_path": "[].id",
            "total_items_considered": 3,
            "duplicate_group_count": 1,
            "page": 1,
            "page_size": 10,
            "has_next_page": false,
            "duplicates": [{
                "value": 1,
                "display_value": "1",
                "count": 2,
                "record_indexes": [0, 2],
                "source_paths": ["0.id", "2.id"],
                "parent_items": []
            }],
            "all_values_summary": [{
                "value": 1,
                "display_value": "1",
                "count": 2,
                "is_duplicate": true
            }]
        })
    );
}

#[test]
fn config_and_curl_parity_dtos_serialize_to_stable_shapes() {
    let config = ConfigResponse {
        config: AppConfig::default(),
    };
    assert_eq!(
        serde_json::to_value(config).unwrap(),
        json!({
            "config": {
                "limits": {
                    "max_json_bytes": 16777216,
                    "max_json_depth": 512,
                    "values_explorer": {
                        "max_selected_fields": 5,
                        "default_page_size": 25,
                          "page_sizes": [10, 25, 50, 100],
                          "max_page_size": 100,
                          "max_parent_items_per_group": 100,
                        "max_match_combinations_per_record": 10000,
                        "max_match_combinations_per_request": 100000
                    },
                    "duplicates": {
                        "composite_min_fields": 2,
                          "composite_max_fields": 5,
                          "default_page_size": 25,
                          "max_page_size": 100,
                          "max_match_combinations_per_record": 10000,
                        "max_match_combinations_per_request": 100000
                    },
                    "curl": {
                        "enabled": true,
                        "default_timeout_ms": 30000,
                        "max_timeout_ms": 120000,
                        "max_response_bytes": 1048576,
                        "max_batch_size": 100,
                        "default_max_concurrency": 5,
                        "max_concurrency": 10,
                        "large_batch_confirmation_threshold": 20,
                        "allow_private_networks_by_default": true
                    }
                },
                "validation": {
                    "schema_json": null,
                    "schema_path": null,
                    "enforcement": "disabled"
                },
                "features": {
                    "values_explorer": true,
                    "advanced_duplicates": true,
                    "pdf_export": false,
                    "curl_executor": true,
                    "curl_single_request_execution": true,
                    "curl_jobs": true,
                    "curl_batch": true,
                    "curl_cancel": true,
                    "metrics_ui": false,
                    "http_openapi_adapter": false,
                    "sqlite_curl_jobs": false
                  }
            }
        })
    );

    let parsed = ParsedCurlPreview {
        method: "POST".to_string(),
        url: "https://api.example.com/users".to_string(),
        headers: vec![
            CurlHeader {
                name: "Authorization".to_string(),
                value: "Bearer ***".to_string(),
                redacted: true,
            },
            CurlHeader {
                name: "Content-Type".to_string(),
                value: "application/json".to_string(),
                redacted: false,
            },
        ],
        body: Some(r#"{"name":"Alice"}"#.to_string()),
        body_kind: Some(CurlBodyKind::JsonString),
        auth: CurlAuthPreview {
            bearer_token_present: true,
            scheme: Some("Bearer".to_string()),
        },
        supported_options: vec!["-X".to_string(), "-H".to_string(), "--data".to_string()],
        warnings: vec![],
    };
    assert_eq!(
        serde_json::to_value(CurlParseResponse {
            parsed: parsed.clone()
        })
        .unwrap(),
        json!({
            "parsed": {
                "method": "POST",
                "url": "https://api.example.com/users",
                "headers": [
                    { "name": "Authorization", "value": "Bearer ***", "redacted": true },
                    { "name": "Content-Type", "value": "application/json", "redacted": false }
                ],
                "body": "{\"name\":\"Alice\"}",
                "body_kind": "json_string",
                "auth": { "bearer_token_present": true, "scheme": "Bearer" },
                "supported_options": ["-X", "-H", "--data"],
                "warnings": []
            }
        })
    );

    assert_eq!(
        serde_json::to_value(CurlGuardrailRequest {
            method: "GET".to_string(),
            url: "https://api.example.com/users".to_string(),
            redirect_target: None,
        })
        .unwrap(),
        json!({
            "method": "GET",
            "url": "https://api.example.com/users",
            "redirect_target": null
        })
    );

    assert_eq!(
        serde_json::to_value(CurlGuardrailResponse {
            decision: CurlGuardrailDecision {
                allowed: true,
                reason: "public_https_url".to_string(),
                error_type: None,
            },
        })
        .unwrap(),
        json!({
            "decision": {
                "allowed": true,
                "reason": "public_https_url",
                "error_type": null
            }
        })
    );

    assert_eq!(
        serde_json::to_value(CurlExecuteRequest {
            curl: "curl -H 'Authorization: Bearer secret-token' https://api.example.com/users"
                .to_string(),
            timeout_ms: Some(30_000),
            follow_redirects: false,
        })
        .unwrap(),
        json!({
            "curl": "curl -H 'Authorization: Bearer secret-token' https://api.example.com/users",
            "timeout_ms": 30000,
            "follow_redirects": false
        })
    );

    assert_eq!(
        serde_json::to_value(CurlStartJobRequest {
            curl: "curl https://api.example.com/items/{id}".to_string(),
            placeholder: Some("{id}".to_string()),
            values: vec!["1".to_string(), "2".to_string()],
            timeout_ms: Some(30_000),
            max_concurrency: None,
            follow_redirects: true,
            confirm_large_batch: false,
        })
        .unwrap(),
        json!({
            "curl": "curl https://api.example.com/items/{id}",
            "placeholder": "{id}",
            "values": ["1", "2"],
            "timeout_ms": 30000,
            "max_concurrency": null,
            "follow_redirects": true,
            "confirm_large_batch": false
        })
    );

    let job = CurlJobResultsResponse {
        job: CurlJobSummary {
            job_id: "job-1".to_string(),
            status: CurlJobStatus::Failed,
            total_requests: 1,
            completed_requests: 0,
            failed_requests: 1,
            canceled_requests: 0,
            created_at_utc: "2026-06-03T12:00:00Z".to_string(),
            updated_at_utc: "2026-06-03T12:00:01Z".to_string(),
        },
        results: vec![CurlJobResult {
            index: 0,
            status: CurlJobStatus::Failed,
            input_value: Some("value-1".to_string()),
            request_preview: Some(parsed),
            response: None,
            error: Some(SerializableProblem {
                error_type: "curl_guardrail_denied".to_string(),
                title: "Curl request blocked".to_string(),
                status: 403,
                detail: "localhost_targets_are_blocked_by_default".to_string(),
                invalid_params: vec![SerializableInvalidParam {
                    name: "url".to_string(),
                    reason: "localhost_targets_are_blocked_by_default".to_string(),
                }],
            }),
        }],
    };
    let job_json = serde_json::to_value(job).unwrap();
    assert_eq!(job_json["job"]["status"], "failed");
    assert_eq!(
        job_json["results"][0]["error"]["error_type"],
        "curl_guardrail_denied"
    );
    assert_eq!(
        job_json["results"][0]["request_preview"]["headers"][0]["value"],
        "Bearer ***"
    );
}

#[test]
fn parity_error_constructors_serialize_to_fixture_shapes() {
    let unsupported = AppError::unsupported_file_upload_option("curl", "-F");
    assert_eq!(
        serde_json::to_value(unsupported).unwrap(),
        json!({
            "error_type": "unsupported_file_upload_option",
            "title": "Unsupported curl file upload option",
            "status": 400,
            "detail": "File upload curl options are not supported by the desktop curl parser",
            "instance": null,
            "invalid_params": [{ "name": "curl", "reason": "unsupported file upload option -F" }]
        })
    );

    let denied = AppError::curl_guardrail_denied("url", "localhost_targets_are_blocked_by_default");
    assert_eq!(
        serde_json::to_value(denied).unwrap(),
        json!({
            "error_type": "curl_guardrail_denied",
            "title": "Curl request blocked",
            "status": 403,
            "detail": "localhost_targets_are_blocked_by_default",
            "instance": null,
            "invalid_params": [{
                "name": "url",
                "reason": "localhost_targets_are_blocked_by_default"
            }]
        })
    );
}
