use std::time::Duration;

use json_analyzer::*;

use crate::support::{RecordingCurlClient, SequenceCurlClient, mock_response};

#[test]
fn execute_curl_default_config_allows_single_request_execution_with_mocked_client() {
    let client = RecordingCurlClient::new(Ok(mock_response(200, b"{}")));
    let response = execute_curl_request_with_client(
        CurlExecuteRequest {
            curl: "curl http://93.184.216.34/status".to_string(),
            timeout_ms: Some(1_000),
            follow_redirects: false,
        },
        &CurlLimitsConfig::default(),
        &client,
    )
    .unwrap();

    assert!(response.guardrail.allowed);
    assert_eq!(response.response.unwrap().status, 200);
    let seen = client.seen_requests();
    assert_eq!(seen.len(), 1);
    assert!(seen[0].resolved_addrs.is_empty());
}
#[test]
fn reqwest_client_rejects_hostname_requests_without_guarded_dns_addresses() {
    let client = ReqwestCurlHttpClient;
    let error = client
        .send(
            CurlHttpRequest {
                method: "GET".to_string(),
                url: "https://example.com/status".to_string(),
                resolved_addrs: Vec::new(),
                headers: Vec::new(),
                body: None,
            },
            Duration::from_millis(25),
            1024,
        )
        .unwrap_err();

    assert_eq!(
        error,
        CurlHttpClientError::GuardrailDenied(
            "hostname_resolution_returned_no_addresses".to_string()
        )
    );
}
#[test]
fn execute_curl_disabled_config_blocks_before_network() {
    let client = RecordingCurlClient::new(Ok(mock_response(200, b"{}")));
    let error = execute_curl_request_with_client(
        CurlExecuteRequest {
            curl: "curl http://93.184.216.34/status".to_string(),
            timeout_ms: Some(1_000),
            follow_redirects: false,
        },
        &CurlLimitsConfig {
            enabled: false,
            ..CurlLimitsConfig::default()
        },
        &client,
    )
    .unwrap_err();

    assert_eq!(error.problem.error_type, "unsupported_config");
    assert_eq!(error.problem.invalid_params[0].name, "limits.curl.enabled");
    assert!(client.seen_requests().is_empty());
}
#[test]
fn disabled_curl_limit_blocks_service_curl_boundary_methods() {
    let service = JsonAnalyzerService::new(AppConfig {
        limits: LimitsConfig {
            curl: CurlLimitsConfig {
                enabled: false,
                ..CurlLimitsConfig::default()
            },
            ..LimitsConfig::default()
        },
        ..AppConfig::default()
    });

    let parse_error = service
        .parse_curl(CurlParseRequest {
            curl: "curl http://93.184.216.34/status".to_string(),
        })
        .unwrap_err();
    assert_eq!(
        parse_error.problem.invalid_params[0].name,
        "limits.curl.enabled"
    );

    let guardrail_error = service
        .validate_curl_guardrail(CurlGuardrailRequest {
            method: "GET".to_string(),
            url: "http://93.184.216.34/status".to_string(),
            redirect_target: None,
        })
        .unwrap_err();
    assert_eq!(
        guardrail_error.problem.invalid_params[0].name,
        "limits.curl.enabled"
    );

    let execute_error = service
        .execute_curl(CurlExecuteRequest {
            curl: "curl http://93.184.216.34/status".to_string(),
            timeout_ms: Some(1_000),
            follow_redirects: false,
        })
        .unwrap_err();
    assert_eq!(
        execute_error.problem.invalid_params[0].name,
        "limits.curl.enabled"
    );

    let start_error = service
        .start_curl_job(CurlStartJobRequest {
            curls: vec!["curl http://93.184.216.34/status".to_string()],
            timeout_ms: Some(1_000),
            follow_redirects: false,
            confirm_large_batch: false,
        })
        .unwrap_err();
    assert_eq!(
        start_error.problem.invalid_params[0].name,
        "limits.curl.enabled"
    );
}
#[test]
fn execute_curl_rejects_parse_errors_before_network() {
    let service = JsonAnalyzerService::default();
    let error = service
        .execute_curl(CurlExecuteRequest {
            curl: "wget https://api.example.com".to_string(),
            timeout_ms: Some(1_000),
            follow_redirects: false,
        })
        .unwrap_err();

    assert_eq!(error.problem.error_type, "invalid_request");
    assert_eq!(error.problem.status, Some(400));
    assert_eq!(error.problem.invalid_params[0].name, "curl");
}
#[test]
fn execute_curl_rejects_guardrail_denied_targets_before_network() {
    let client = RecordingCurlClient::new(Ok(mock_response(200, b"{}")));
    let error = execute_curl_request_with_client(
        CurlExecuteRequest {
            curl: "curl http://localhost/admin".to_string(),
            timeout_ms: Some(1_000),
            follow_redirects: false,
        },
        &CurlLimitsConfig::default(),
        &client,
    )
    .unwrap_err();

    assert_eq!(error.problem.error_type, "curl_guardrail_denied");
    assert_eq!(error.problem.status, Some(403));
    assert_eq!(error.problem.invalid_params[0].name, "url");
    assert!(client.seen_requests().is_empty());
}
#[test]
fn execute_curl_redacts_url_secrets_from_network_error_details() {
    let client = RecordingCurlClient::new(Err(CurlHttpClientError::Network(
        "error sending request for url (http://user:password@93.184.216.34/search?api_key=secret&q=alice&token=abc): connection reset".to_string(),
    )));
    let error = execute_curl_request_with_client(
        CurlExecuteRequest {
            curl:
                "curl 'http://user:password@93.184.216.34/search?api_key=secret&q=alice&token=abc'"
                    .to_string(),
            timeout_ms: Some(1_000),
            follow_redirects: false,
        },
        &CurlLimitsConfig::default(),
        &client,
    )
    .unwrap_err();

    assert_eq!(error.problem.error_type, "curl_network_error");
    assert!(
        error
            .problem
            .detail
            .contains("http://93.184.216.34/search?api_key=***&q=alice&token=***")
    );
    assert!(!error.problem.detail.contains("user:password"));
    assert!(!error.problem.detail.contains("api_key=secret"));
    assert!(!error.problem.detail.contains("token=abc"));
}
#[test]
fn execute_curl_returns_structured_timeout_shape_from_client() {
    let client = RecordingCurlClient::new(Err(CurlHttpClientError::Timeout));
    let error = execute_curl_request_with_client(
        CurlExecuteRequest {
            curl: "curl http://93.184.216.34/resource".to_string(),
            timeout_ms: Some(25),
            follow_redirects: false,
        },
        &CurlLimitsConfig::default(),
        &client,
    )
    .unwrap_err();

    assert_eq!(error.problem.error_type, "curl_timeout");
    assert_eq!(error.problem.title, "Curl request timed out");
    assert_eq!(error.problem.status, Some(504));
    assert_eq!(error.problem.invalid_params[0].name, "timeout_ms");
    assert_eq!(client.seen_requests().len(), 1);
}
#[test]
fn execute_curl_success_with_mocked_client_redacts_ui_output_and_bounds_body() {
    let client = RecordingCurlClient::new(Ok(CurlHttpClientResponse {
        status: 201,
        status_text: Some("Created".to_string()),
        headers: vec![
            RawCurlHeader {
                name: "Content-Type".to_string(),
                value: "application/json".to_string(),
            },
            RawCurlHeader {
                name: "Set-Cookie".to_string(),
                value: "session=secret".to_string(),
            },
        ],
        body: b"{\"ok\"".to_vec(),
        body_truncated: true,
        response_bytes: 17,
    }));

    let response = execute_curl_request_with_client(
        CurlExecuteRequest {
            curl: "curl -X POST -H 'Authorization: Bearer secret-token' -H 'Content-Type: application/json' --data '{\"password\":\"secret\",\"name\":\"Alice\"}' http://93.184.216.34/users".to_string(),
            timeout_ms: Some(1_000),
            follow_redirects: false,
        },
        &CurlLimitsConfig {
            max_response_bytes: 5,
            ..CurlLimitsConfig::default()
        },
        &client,
    )
    .unwrap();

    assert!(response.guardrail.allowed);
    assert_eq!(response.request_preview.headers[0].value, "Bearer ***");
    assert_eq!(
        response.request_preview.body.as_deref(),
        Some(r#"{"name":"Alice","password":"***"}"#)
    );
    let http = response.response.unwrap();
    assert_eq!(http.status, 201);
    assert_eq!(http.status_text.as_deref(), Some("Created"));
    assert_eq!(http.body, "{\"ok\"");
    assert!(http.body_truncated);
    assert_eq!(http.response_bytes, 17);
    assert_eq!(http.headers[1].name, "Set-Cookie");
    assert_eq!(http.headers[1].value, "***");
    assert!(http.headers[1].redacted);

    let seen = client.seen_requests();
    assert_eq!(seen.len(), 1);
    assert_eq!(seen[0].headers[0].value, "Bearer secret-token");
    assert_eq!(
        seen[0].body.as_deref(),
        Some(r#"{"password":"secret","name":"Alice"}"#)
    );
}
#[test]
fn execute_curl_blocks_redirects_to_private_targets() {
    let client = SequenceCurlClient::new(vec![Ok(CurlHttpClientResponse {
        status: 302,
        status_text: Some("Found".to_string()),
        headers: vec![RawCurlHeader {
            name: "Location".to_string(),
            value: "http://localhost/admin".to_string(),
        }],
        body: Vec::new(),
        body_truncated: false,
        response_bytes: 0,
    })]);

    let error = execute_curl_request_with_client(
        CurlExecuteRequest {
            curl: "curl http://93.184.216.34/start".to_string(),
            timeout_ms: Some(1_000),
            follow_redirects: true,
        },
        &CurlLimitsConfig::default(),
        &client,
    )
    .unwrap_err();

    assert_eq!(error.problem.error_type, "curl_guardrail_denied");
    assert_eq!(error.problem.status, Some(403));
    assert_eq!(client.seen_requests().len(), 1);
}
#[test]
fn curl_execution_feature_flags_block_direct_service_execution_paths() {
    let service = JsonAnalyzerService::new(AppConfig {
        features: FeatureFlagsConfig {
            curl_single_request_execution: false,
            ..FeatureFlagsConfig::default()
        },
        ..AppConfig::default()
    });
    let single_error = service
        .execute_curl(CurlExecuteRequest {
            curl: "curl http://93.184.216.34/status".to_string(),
            timeout_ms: Some(50),
            follow_redirects: false,
        })
        .unwrap_err();
    assert_eq!(
        single_error.problem.invalid_params[0].name,
        "features.curl_single_request_execution"
    );

    let single_job_error = service
        .start_curl_job(CurlStartJobRequest {
            curls: vec!["curl http://93.184.216.34/status".to_string()],
            timeout_ms: Some(50),
            follow_redirects: false,
            confirm_large_batch: false,
        })
        .unwrap_err();
    assert_eq!(
        single_job_error.problem.invalid_params[0].name,
        "features.curl_single_request_execution"
    );

    let service = JsonAnalyzerService::new(AppConfig {
        features: FeatureFlagsConfig {
            curl_executor: false,
            ..FeatureFlagsConfig::default()
        },
        ..AppConfig::default()
    });
    let job_error = service
        .start_curl_job(CurlStartJobRequest {
            curls: vec!["curl http://93.184.216.34/status".to_string()],
            timeout_ms: Some(50),
            follow_redirects: false,
            confirm_large_batch: false,
        })
        .unwrap_err();
    assert_eq!(
        job_error.problem.invalid_params[0].name,
        "features.curl_executor"
    );
}
#[test]
fn execute_curl_strips_sensitive_headers_on_cross_origin_redirects() {
    let client = SequenceCurlClient::new(vec![
        Ok(CurlHttpClientResponse {
            status: 302,
            status_text: Some("Found".to_string()),
            headers: vec![RawCurlHeader {
                name: "Location".to_string(),
                value: "http://93.184.216.35/next".to_string(),
            }],
            body: Vec::new(),
            body_truncated: false,
            response_bytes: 0,
        }),
        Ok(mock_response(200, b"ok")),
    ]);

    let response = execute_curl_request_with_client(
        CurlExecuteRequest {
            curl: "curl -H 'Authorization: Bearer secret-token' -H 'X-Api-Key: secret-key' -H 'Accept: application/json' http://93.184.216.34/start".to_string(),
            timeout_ms: Some(1_000),
            follow_redirects: true,
        },
        &CurlLimitsConfig::default(),
        &client,
    )
    .unwrap();

    assert_eq!(response.response.unwrap().status, 200);
    let seen = client.seen_requests();
    assert_eq!(seen.len(), 2);
    assert!(
        seen[0]
            .headers
            .iter()
            .any(|header| header.name == "Authorization")
    );
    assert!(
        seen[0]
            .headers
            .iter()
            .any(|header| header.name == "X-Api-Key")
    );
    assert!(
        !seen[1]
            .headers
            .iter()
            .any(|header| header.name == "Authorization")
    );
    assert!(
        !seen[1]
            .headers
            .iter()
            .any(|header| header.name == "X-Api-Key")
    );
    assert!(seen[1].headers.iter().any(|header| header.name == "Accept"));
}

#[test]
fn execute_curl_follows_relative_same_origin_redirects_without_stripping_headers() {
    let client = SequenceCurlClient::new(vec![
        Ok(CurlHttpClientResponse {
            status: 302,
            status_text: Some("Found".to_string()),
            headers: vec![RawCurlHeader {
                name: "Location".to_string(),
                value: "/next".to_string(),
            }],
            body: Vec::new(),
            body_truncated: false,
            response_bytes: 0,
        }),
        Ok(mock_response(200, b"ok")),
    ]);

    let response = execute_curl_request_with_client(
        CurlExecuteRequest {
            curl: "curl -H 'Authorization: Bearer secret-token' -H 'Accept: application/json' http://93.184.216.34/start".to_string(),
            timeout_ms: Some(1_000),
            follow_redirects: true,
        },
        &CurlLimitsConfig::default(),
        &client,
    )
    .unwrap();

    assert_eq!(response.response.unwrap().status, 200);
    let seen = client.seen_requests();
    assert_eq!(seen.len(), 2);
    assert_eq!(seen[0].url, "http://93.184.216.34/start");
    assert_eq!(seen[1].url, "http://93.184.216.34/next");
    assert!(
        seen[1]
            .headers
            .iter()
            .any(|header| header.name == "Authorization")
    );
    assert!(seen[1].headers.iter().any(|header| header.name == "Accept"));
}
