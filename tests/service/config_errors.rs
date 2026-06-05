use json_analyzer::*;

#[test]
fn service_regressions_cover_size_limit_boundary_whitespace_and_error_shape() {
    let service = JsonAnalyzerService::default();
    let whitespace = service
        .validate(ValidateRequest {
            json_string: "  \n\t  ".to_string(),
        })
        .unwrap_err();
    assert_eq!(whitespace.problem.error_type, "json_parse_error");
    assert_eq!(whitespace.problem.status, Some(400));
    assert_eq!(whitespace.problem.position.as_ref().unwrap().line, 2);

    let boundary_service = JsonAnalyzerService::new(AppConfig {
        limits: LimitsConfig {
            max_json_bytes: 2,
            ..LimitsConfig::default()
        },
        validation: ValidationConfig::default(),
        features: FeatureFlagsConfig::default(),
    });
    assert!(
        boundary_service
            .validate(ValidateRequest {
                json_string: "{}".to_string(),
            })
            .unwrap()
            .valid
    );

    let too_large = boundary_service
        .validate(ValidateRequest {
            json_string: "{} ".to_string(),
        })
        .unwrap_err();
    assert_eq!(too_large.problem.error_type, "invalid_request");
    assert_eq!(
        too_large.problem.detail,
        "JSON string too large (max 2 bytes)"
    );
    assert_eq!(too_large.problem.invalid_params[0].name, "json_string");

    let depth_limited_service = JsonAnalyzerService::new(AppConfig {
        limits: LimitsConfig {
            max_json_depth: 2,
            ..LimitsConfig::default()
        },
        ..AppConfig::default()
    });
    assert!(
        depth_limited_service
            .validate(ValidateRequest {
                json_string: "{\"items\":[1]}".to_string(),
            })
            .unwrap()
            .valid
    );
    let too_deep = depth_limited_service
        .validate(ValidateRequest {
            json_string: "{\"items\":[[1]]}".to_string(),
        })
        .unwrap_err();
    assert_eq!(too_deep.problem.error_type, "invalid_request");
    assert_eq!(too_deep.problem.invalid_params[0].name, "json_string");
    assert_eq!(
        too_deep.problem.detail,
        "JSON nesting too deep (max depth 2)"
    );
}

#[test]
fn typed_config_is_owned_by_service_and_returned_without_env_lookup() {
    let config = AppConfig {
        limits: LimitsConfig {
            max_json_bytes: 12,
            ..LimitsConfig::default()
        },
        validation: ValidationConfig::default(),
        features: FeatureFlagsConfig::default(),
    };
    let service = JsonAnalyzerService::new(config.clone());

    let returned_config = service.get_config().unwrap().config;
    assert_eq!(returned_config, config);
    assert_eq!(
        returned_config.limits.max_json_depth,
        DEFAULT_MAX_JSON_DEPTH
    );
    assert_eq!(returned_config.limits.values_explorer.default_page_size, 25);
    assert_eq!(
        returned_config.limits.values_explorer.page_sizes,
        vec![10, 25, 50, 100]
    );
    assert_eq!(
        returned_config.limits.values_explorer.max_selected_fields,
        5
    );
    assert_eq!(returned_config.limits.duplicates.composite_min_fields, 2);
    assert_eq!(returned_config.limits.duplicates.composite_max_fields, 5);
    assert_eq!(returned_config.limits.values_explorer.max_page_size, 100);
    assert_eq!(returned_config.limits.duplicates.max_page_size, 100);
    assert_eq!(returned_config.limits.curl.default_timeout_ms, 30_000);
    assert!(returned_config.limits.curl.enabled);
    assert!(!returned_config.features.pdf_export);
    assert!(returned_config.features.curl_executor);
    assert!(returned_config.features.curl_single_request_execution);
    assert!(returned_config.features.curl_jobs);
    assert!(returned_config.features.curl_batch);
    assert!(returned_config.features.curl_cancel);
    assert!(!returned_config.features.metrics_ui);
    assert!(!returned_config.features.http_openapi_adapter);
    assert!(!returned_config.features.sqlite_curl_jobs);

    let too_large = service
        .validate(ValidateRequest {
            json_string: "{\"long\":true}".to_string(),
        })
        .unwrap_err();
    assert_eq!(too_large.problem.error_type, "invalid_request");
    assert_eq!(too_large.problem.invalid_params[0].name, "json_string");
}

#[test]
fn unsupported_schema_config_fails_fast_until_schema_validation_is_implemented() {
    let service = JsonAnalyzerService::new(AppConfig {
        limits: LimitsConfig::default(),
        validation: ValidationConfig {
            schema_json: Some("{}".to_string()),
            schema_path: None,
            enforcement: SchemaEnforcement::Warn,
        },
        features: FeatureFlagsConfig::default(),
    });

    let error = service
        .validate(ValidateRequest {
            json_string: "{}".to_string(),
        })
        .unwrap_err();

    assert_eq!(error.problem.error_type, "unsupported_config");
    assert_eq!(error.problem.status, Some(501));
    assert_eq!(
        error.problem.invalid_params[0].name,
        "validation.schema_json"
    );
}
