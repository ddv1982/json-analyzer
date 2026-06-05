use json_analyzer::*;
use serde_json::json;

use crate::support::PARITY_CONTRACTS_SHARED_DATASET;

#[test]
fn disabled_advanced_duplicates_feature_gates_service_methods() {
    let service = JsonAnalyzerService::new(AppConfig {
        features: FeatureFlagsConfig {
            advanced_duplicates: false,
            ..FeatureFlagsConfig::default()
        },
        ..AppConfig::default()
    });

    let advanced_error = service
        .analyze_advanced_field_duplicates(AdvancedFieldDuplicatesRequest {
            json_string: "[]".to_string(),
            field_path: "".to_string(),
            filter: None,
            case_sensitive: true,
            include_parent_items: false,
            page: 0,
            page_size: 0,
        })
        .unwrap_err();
    assert_eq!(advanced_error.problem.error_type, "unsupported_config");
    assert_eq!(advanced_error.problem.status, Some(501));
    assert_eq!(
        advanced_error.problem.invalid_params[0].name,
        "features.advanced_duplicates"
    );

    let composite_error = service
        .analyze_composite_duplicates(CompositeDuplicatesRequest {
            json_string: "[]".to_string(),
            field_paths: vec!["[].department".to_string()],
            filter: None,
            case_sensitive: true,
            include_parent_items: false,
            page: 0,
            page_size: 0,
        })
        .unwrap_err();
    assert_eq!(composite_error.problem.error_type, "unsupported_config");
    assert_eq!(
        composite_error.problem.invalid_params[0].name,
        "features.advanced_duplicates"
    );
}

#[test]
fn advanced_duplicate_service_methods_cover_item_8_core_without_ipc() {
    let service = JsonAnalyzerService::default();
    let input = PARITY_CONTRACTS_SHARED_DATASET.to_string();

    let filtered = service
        .analyze_advanced_field_duplicates(AdvancedFieldDuplicatesRequest {
            json_string: input.clone(),
            field_path: "[].department".to_string(),
            filter: Some(DuplicateFilter {
                field_path: "[].status".to_string(),
                value: json!("active"),
            }),
            case_sensitive: false,
            include_parent_items: true,
            page: 1,
            page_size: 10,
        })
        .unwrap();
    assert_eq!(filtered.total_items_considered, 6);
    assert_eq!(filtered.duplicate_group_count, 2);
    assert_eq!(filtered.duplicates[0].value, json!("engineering"));
    assert_eq!(filtered.duplicates[0].record_indexes, vec![0, 1, 4]);
    assert_eq!(filtered.all_values_summary[2].value, json!("support"));
    assert!(!filtered.all_values_summary[2].is_duplicate);
    assert_eq!(
        filtered.duplicates[0].parent_items[0].summary["status"],
        json!("active")
    );

    let composite = service
        .analyze_composite_duplicates(CompositeDuplicatesRequest {
            json_string: input,
            field_paths: vec!["[].department".to_string(), "[].role".to_string()],
            filter: None,
            case_sensitive: true,
            include_parent_items: true,
            page: 1,
            page_size: 10,
        })
        .unwrap();
    assert_eq!(composite.duplicate_group_count, 3);
    assert_eq!(
        composite.duplicates[0].key,
        vec![json!("Engineering"), json!("Developer")]
    );
    assert_eq!(composite.duplicates[0].record_indexes, vec![0, 1, 4]);
    assert_eq!(
        composite.duplicates[2].key,
        vec![json!("Support"), json!("Analyst")]
    );
}

#[test]
fn advanced_duplicate_service_validates_invalid_requests_like_contract() {
    let service = JsonAnalyzerService::default();

    let duplicate_fields = service
        .analyze_composite_duplicates(CompositeDuplicatesRequest {
            json_string: "[]".to_string(),
            field_paths: vec!["[].department".to_string(), "[].department".to_string()],
            filter: None,
            case_sensitive: true,
            include_parent_items: false,
            page: 1,
            page_size: 10,
        })
        .unwrap_err();
    assert_eq!(duplicate_fields.problem.error_type, "invalid_request");
    assert_eq!(duplicate_fields.problem.status, Some(400));
    assert_eq!(
        duplicate_fields.problem.invalid_params[0].name,
        "field_paths"
    );
    assert_eq!(
        duplicate_fields.problem.detail,
        "field_paths must contain unique fields"
    );

    let too_few = service
        .analyze_composite_duplicates(CompositeDuplicatesRequest {
            json_string: "[]".to_string(),
            field_paths: vec!["[].department".to_string()],
            filter: None,
            case_sensitive: true,
            include_parent_items: false,
            page: 1,
            page_size: 10,
        })
        .unwrap_err();
    assert_eq!(too_few.problem.invalid_params[0].name, "field_paths");
    assert_eq!(too_few.problem.detail, "field_paths supports 2 to 5 fields");

    let too_many = service
        .analyze_composite_duplicates(CompositeDuplicatesRequest {
            json_string: "[]".to_string(),
            field_paths: vec![
                "a".to_string(),
                "b".to_string(),
                "c".to_string(),
                "d".to_string(),
                "e".to_string(),
                "f".to_string(),
            ],
            filter: None,
            case_sensitive: true,
            include_parent_items: false,
            page: 1,
            page_size: 10,
        })
        .unwrap_err();
    assert_eq!(
        too_many.problem.detail,
        "field_paths supports 2 to 5 fields"
    );

    let page_zero = service
        .analyze_advanced_field_duplicates(AdvancedFieldDuplicatesRequest {
            json_string: "[]".to_string(),
            field_path: "[].department".to_string(),
            filter: None,
            case_sensitive: true,
            include_parent_items: false,
            page: 0,
            page_size: 10,
        })
        .unwrap_err();
    assert_eq!(page_zero.problem.invalid_params[0].name, "page");
    assert_eq!(
        page_zero.problem.detail,
        "page must be greater than or equal to 1"
    );

    let huge_page = service
        .analyze_advanced_field_duplicates(AdvancedFieldDuplicatesRequest {
            json_string: "[]".to_string(),
            field_path: "[].department".to_string(),
            filter: None,
            case_sensitive: true,
            include_parent_items: false,
            page: 1,
            page_size: 101,
        })
        .unwrap_err();
    assert_eq!(huge_page.problem.invalid_params[0].name, "page_size");
    assert_eq!(huge_page.problem.detail, "page_size cannot exceed 100");
}

#[test]
fn composite_duplicate_service_uses_configured_field_limits() {
    let service = JsonAnalyzerService::new(AppConfig {
        limits: LimitsConfig {
            duplicates: DuplicateLimitsConfig {
                composite_min_fields: 3,
                composite_max_fields: 4,
                ..DuplicateLimitsConfig::default()
            },
            ..LimitsConfig::default()
        },
        ..AppConfig::default()
    });

    let too_few = service
        .analyze_composite_duplicates(CompositeDuplicatesRequest {
            json_string: "[]".to_string(),
            field_paths: vec!["[].department".to_string(), "[].role".to_string()],
            filter: None,
            case_sensitive: true,
            include_parent_items: false,
            page: 1,
            page_size: 10,
        })
        .unwrap_err();
    assert_eq!(too_few.problem.invalid_params[0].name, "field_paths");
    assert_eq!(too_few.problem.detail, "field_paths supports 3 to 4 fields");

    let accepted = service
        .analyze_composite_duplicates(CompositeDuplicatesRequest {
            json_string: r#"[{"a":1,"b":2,"c":3},{"a":1,"b":2,"c":3}]"#.to_string(),
            field_paths: vec![" [].a ".to_string(), "[].b".to_string(), "[].c".to_string()],
            filter: None,
            case_sensitive: true,
            include_parent_items: false,
            page: 1,
            page_size: 10,
        })
        .unwrap();
    assert_eq!(
        accepted.field_paths,
        vec!["[].a".to_string(), "[].b".to_string(), "[].c".to_string()]
    );
    assert_eq!(accepted.duplicate_group_count, 1);
}

#[test]
fn composite_duplicate_service_rejects_explosive_match_combinations() {
    let service = JsonAnalyzerService::default();
    let long_array = (0..101)
        .map(|index| index.to_string())
        .collect::<Vec<_>>()
        .join(",");
    let input =
        format!(r#"[{{"left":[{long_array}],"right":[{long_array}]}},{{"left":[0],"right":[0]}}]"#);

    let error = service
        .analyze_composite_duplicates(CompositeDuplicatesRequest {
            json_string: input,
            field_paths: vec!["[].left.[]".to_string(), "[].right.[]".to_string()],
            filter: None,
            case_sensitive: true,
            include_parent_items: false,
            page: 1,
            page_size: 10,
        })
        .unwrap_err();

    assert_eq!(error.problem.error_type, "invalid_request");
    assert_eq!(error.problem.invalid_params[0].name, "field_paths");
    assert!(
        error
            .problem
            .detail
            .contains("match combinations exceed limit")
    );
    assert!(error.problem.detail.contains("record 0"));
    assert!(error.problem.detail.contains("10201 combinations"));
}
