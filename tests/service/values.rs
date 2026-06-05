use json_analyzer::*;
use serde_json::json;

#[test]
fn disabled_values_explorer_feature_gates_service_methods() {
    let service = JsonAnalyzerService::new(AppConfig {
        features: FeatureFlagsConfig {
            values_explorer: false,
            ..FeatureFlagsConfig::default()
        },
        ..AppConfig::default()
    });

    let discovery_error = service
        .discover_values_fields(ValuesFieldDiscoveryRequest {
            json_string: "[]".to_string(),
            search: None,
            limit: Some(0),
            flatten: false,
        })
        .unwrap_err();
    assert_eq!(discovery_error.problem.error_type, "unsupported_config");
    assert_eq!(discovery_error.problem.status, Some(501));
    assert_eq!(
        discovery_error.problem.invalid_params[0].name,
        "features.values_explorer"
    );

    let analysis_error = service
        .analyze_values(ValuesAnalysisRequest {
            json_string: "[]".to_string(),
            selected_fields: vec!["[].id".to_string()],
            search: None,
            sort: ValuesSort {
                by: ValuesSortBy::Count,
                direction: SortDirection::Desc,
            },
            page: 1,
            page_size: 10,
            include_parent_items: false,
            flatten: false,
        })
        .unwrap_err();
    assert_eq!(analysis_error.problem.error_type, "unsupported_config");
    assert_eq!(
        analysis_error.problem.invalid_params[0].name,
        "features.values_explorer"
    );

    let explorer_analysis_error = service
        .analyze_values_explorer(ValuesExplorerAnalysisRequest {
            json_string: "[]".to_string(),
            selected_fields: vec!["[].id".to_string()],
            filter: None,
            sort_mode: ValuesExplorerSortMode::Frequency,
            page: 1,
            groups_page: None,
            page_size: 10,
            flatten: false,
        })
        .unwrap_err();
    assert_eq!(
        explorer_analysis_error.problem.error_type,
        "unsupported_config"
    );
    assert_eq!(
        explorer_analysis_error.problem.invalid_params[0].name,
        "features.values_explorer"
    );
}

#[test]
fn values_explorer_service_methods_cover_item_5_core_without_ipc() {
    let service = JsonAnalyzerService::default();
    let input = r#"[
      {"id":1,"name":"Alice","department":"Engineering","role":"Developer"},
      {"id":2,"name":"Bob","department":"Engineering","role":"Developer"},
      {"id":3,"name":"Carol","department":"Design","role":"Designer"},
      {"id":4,"name":"Dan","department":"Engineering","role":"Manager"}
    ]"#;

    let fields = service
        .discover_values_fields(ValuesFieldDiscoveryRequest {
            json_string: input.to_string(),
            search: Some("dep".to_string()),
            limit: Some(10),
            flatten: false,
        })
        .unwrap();
    assert_eq!(fields.fields.len(), 1);
    assert_eq!(fields.fields[0].field_path, "[].department");
    assert_eq!(fields.fields[0].unique_value_count, 2);

    let values = service
        .analyze_values(ValuesAnalysisRequest {
            json_string: input.to_string(),
            selected_fields: vec!["[].department".to_string(), "[].role".to_string()],
            search: None,
            sort: ValuesSort {
                by: ValuesSortBy::Count,
                direction: SortDirection::Desc,
            },
            page: 1,
            page_size: 2,
            include_parent_items: true,
            flatten: false,
        })
        .unwrap();
    assert_eq!(values.total_groups, 3);
    assert!(values.has_next_page);
    assert_eq!(
        values.groups[0].key,
        vec![json!("Engineering"), json!("Developer")]
    );
    assert_eq!(values.groups[0].count, 2);
    assert_eq!(
        values.groups[0].parent_items[0].source_path.as_deref(),
        Some("0")
    );

    let second_page = service
        .analyze_values(ValuesAnalysisRequest {
            json_string: input.to_string(),
            selected_fields: vec!["[].department".to_string()],
            search: None,
            sort: ValuesSort {
                by: ValuesSortBy::Count,
                direction: SortDirection::Desc,
            },
            page: 2,
            page_size: 1,
            include_parent_items: false,
            flatten: false,
        })
        .unwrap();
    assert_eq!(second_page.total_groups, 2);
    assert_eq!(second_page.groups[0].key, vec![json!("Design")]);
    assert!(!second_page.has_next_page);
}

#[test]
fn values_explorer_service_respects_flatten_nested_arrays() {
    let service = JsonAnalyzerService::default();
    let input = r#"[
      [{"id":1,"department":"Engineering"}],
      [{"id":2,"department":"Design"},{"id":3,"department":"Engineering"}]
    ]"#;

    let raw_fields = service
        .discover_values_fields(ValuesFieldDiscoveryRequest {
            json_string: input.to_string(),
            search: Some("department".to_string()),
            limit: None,
            flatten: false,
        })
        .unwrap();
    assert!(
        raw_fields
            .fields
            .iter()
            .any(|field| field.field_path == "[].department")
    );

    let raw_values = service
        .analyze_values(ValuesAnalysisRequest {
            json_string: input.to_string(),
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
        })
        .unwrap();
    assert_eq!(raw_values.total_groups, 2);
    assert_eq!(raw_values.groups[0].key, vec![json!("Design")]);
    assert_eq!(raw_values.groups[0].count, 1);

    let flattened_fields = service
        .discover_values_fields(ValuesFieldDiscoveryRequest {
            json_string: input.to_string(),
            search: Some("department".to_string()),
            limit: None,
            flatten: true,
        })
        .unwrap();
    assert!(
        flattened_fields
            .fields
            .iter()
            .any(|field| field.field_path == "[].department")
    );

    let flattened_values = service
        .analyze_values(ValuesAnalysisRequest {
            json_string: input.to_string(),
            selected_fields: vec!["[].department".to_string()],
            search: None,
            sort: ValuesSort {
                by: ValuesSortBy::Count,
                direction: SortDirection::Desc,
            },
            page: 1,
            page_size: 10,
            include_parent_items: true,
            flatten: true,
        })
        .unwrap();
    assert_eq!(flattened_values.total_groups, 2);
    assert_eq!(flattened_values.groups[0].key, vec![json!("Engineering")]);
    assert_eq!(flattened_values.groups[0].count, 2);
    assert_eq!(flattened_values.groups[0].record_indexes, vec![0, 2]);
}

#[test]
fn values_explorer_service_caps_parent_items_per_group_from_config() {
    let service = JsonAnalyzerService::new(AppConfig {
        limits: LimitsConfig {
            values_explorer: ValuesExplorerLimitsConfig {
                max_parent_items_per_group: 3,
                ..ValuesExplorerLimitsConfig::default()
            },
            ..LimitsConfig::default()
        },
        ..AppConfig::default()
    });
    let records = (0..12)
        .map(|index| {
            format!(r#"{{"id":{index},"name":"User {index}","department":"Engineering"}}"#)
        })
        .collect::<Vec<_>>()
        .join(",");
    let input = format!("[{records}]");

    let values = service
        .analyze_values(ValuesAnalysisRequest {
            json_string: input,
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
        })
        .unwrap();

    assert_eq!(values.total_groups, 1);
    assert_eq!(values.groups[0].key, vec![json!("Engineering")]);
    assert_eq!(values.groups[0].count, 12);
    assert_eq!(values.groups[0].record_indexes, (0..12).collect::<Vec<_>>());
    assert_eq!(values.groups[0].parent_items.len(), 3);
    assert_eq!(
        values.groups[0]
            .parent_items
            .iter()
            .map(|item| item.record_index)
            .collect::<Vec<_>>(),
        vec![0, 1, 2]
    );
}

#[test]
fn values_explorer_target_endpoint_caps_items_and_uses_independent_group_page() {
    let service = JsonAnalyzerService::new(AppConfig {
        limits: LimitsConfig {
            values_explorer: ValuesExplorerLimitsConfig {
                max_parent_items_per_group: 1,
                ..ValuesExplorerLimitsConfig::default()
            },
            ..LimitsConfig::default()
        },
        ..AppConfig::default()
    });
    let input = r#"[
      {"id":1,"department":"Engineering"},
      {"id":2,"department":"Engineering"},
      {"id":3,"department":"Design"},
      {"id":4,"department":"Support"}
    ]"#;

    let result = service
        .analyze_values_explorer(ValuesExplorerAnalysisRequest {
            json_string: input.to_string(),
            selected_fields: vec!["[].department".to_string()],
            filter: None,
            sort_mode: ValuesExplorerSortMode::Frequency,
            page: 1,
            groups_page: Some(2),
            page_size: 1,
            flatten: false,
        })
        .unwrap();

    assert_eq!(result.page, 1);
    assert_eq!(result.groups_page, 2);
    assert_eq!(result.total_pages, 1);
    assert_eq!(result.groups_total_pages, 3);
    assert_eq!(result.duplicates[0].display_value, "Engineering");
    assert_eq!(result.duplicates[0].count, 2);
    assert_eq!(result.duplicates[0].items.len(), 1);
    assert_eq!(result.all_field_values[0].display_value, "Design");
}

#[test]
fn values_explorer_service_validates_selection_and_pagination_contract() {
    let service = JsonAnalyzerService::default();

    let page_zero = service
        .analyze_values(ValuesAnalysisRequest {
            json_string: "[]".to_string(),
            selected_fields: vec!["[].id".to_string()],
            search: None,
            sort: ValuesSort {
                by: ValuesSortBy::Count,
                direction: SortDirection::Desc,
            },
            page: 0,
            page_size: 10,
            include_parent_items: false,
            flatten: false,
        })
        .unwrap_err();
    assert_eq!(page_zero.problem.error_type, "invalid_request");
    assert_eq!(page_zero.problem.invalid_params[0].name, "page");
    assert_eq!(
        page_zero.problem.detail,
        "page must be greater than or equal to 1"
    );

    let too_many = service
        .analyze_values(ValuesAnalysisRequest {
            json_string: "[]".to_string(),
            selected_fields: vec![
                "a".to_string(),
                "b".to_string(),
                "c".to_string(),
                "d".to_string(),
                "e".to_string(),
                "f".to_string(),
            ],
            search: None,
            sort: ValuesSort {
                by: ValuesSortBy::Count,
                direction: SortDirection::Desc,
            },
            page: 1,
            page_size: 10,
            include_parent_items: false,
            flatten: false,
        })
        .unwrap_err();
    assert_eq!(too_many.problem.invalid_params[0].name, "selected_fields");
    assert_eq!(
        too_many.problem.detail,
        "selected_fields supports 1 to 5 fields"
    );

    let zero_limit = service
        .discover_values_fields(ValuesFieldDiscoveryRequest {
            json_string: "[]".to_string(),
            search: None,
            limit: Some(0),
            flatten: false,
        })
        .unwrap_err();
    assert_eq!(zero_limit.problem.invalid_params[0].name, "limit");

    let groups_page_zero = service
        .analyze_values_explorer(ValuesExplorerAnalysisRequest {
            json_string: "[]".to_string(),
            selected_fields: vec!["[].id".to_string()],
            filter: None,
            sort_mode: ValuesExplorerSortMode::Frequency,
            page: 1,
            groups_page: Some(0),
            page_size: 10,
            flatten: false,
        })
        .unwrap_err();
    assert_eq!(groups_page_zero.problem.error_type, "invalid_request");
    assert_eq!(
        groups_page_zero.problem.invalid_params[0].name,
        "groups_page"
    );
    assert_eq!(
        groups_page_zero.problem.detail,
        "groups_page must be greater than or equal to 1"
    );

    let huge_page = service
        .analyze_values(ValuesAnalysisRequest {
            json_string: "[]".to_string(),
            selected_fields: vec!["[].id".to_string()],
            search: None,
            sort: ValuesSort {
                by: ValuesSortBy::Count,
                direction: SortDirection::Desc,
            },
            page: 1,
            page_size: 101,
            include_parent_items: false,
            flatten: false,
        })
        .unwrap_err();
    assert_eq!(huge_page.problem.invalid_params[0].name, "page_size");
    assert_eq!(huge_page.problem.detail, "page_size cannot exceed 100");
}

#[test]
fn values_explorer_service_uses_configured_field_limit_and_trims_fields() {
    let service = JsonAnalyzerService::new(AppConfig {
        limits: LimitsConfig {
            values_explorer: ValuesExplorerLimitsConfig {
                max_selected_fields: 2,
                ..ValuesExplorerLimitsConfig::default()
            },
            ..LimitsConfig::default()
        },
        ..AppConfig::default()
    });

    let too_many = service
        .analyze_values(ValuesAnalysisRequest {
            json_string: "[]".to_string(),
            selected_fields: vec!["a".to_string(), "b".to_string(), "c".to_string()],
            search: None,
            sort: ValuesSort {
                by: ValuesSortBy::Count,
                direction: SortDirection::Desc,
            },
            page: 1,
            page_size: 10,
            include_parent_items: false,
            flatten: false,
        })
        .unwrap_err();
    assert_eq!(too_many.problem.invalid_params[0].name, "selected_fields");
    assert_eq!(
        too_many.problem.detail,
        "selected_fields supports 1 to 2 fields"
    );

    let duplicate_after_trim = service
        .analyze_values(ValuesAnalysisRequest {
            json_string: "[]".to_string(),
            selected_fields: vec![" [].id ".to_string(), "[].id".to_string()],
            search: None,
            sort: ValuesSort {
                by: ValuesSortBy::Count,
                direction: SortDirection::Desc,
            },
            page: 1,
            page_size: 10,
            include_parent_items: false,
            flatten: false,
        })
        .unwrap_err();
    assert_eq!(
        duplicate_after_trim.problem.detail,
        "selected_fields must contain unique fields"
    );

    let trimmed = service
        .analyze_values(ValuesAnalysisRequest {
            json_string: r#"[{"id":1},{"id":1}]"#.to_string(),
            selected_fields: vec![" [].id ".to_string()],
            search: None,
            sort: ValuesSort {
                by: ValuesSortBy::Count,
                direction: SortDirection::Desc,
            },
            page: 1,
            page_size: 10,
            include_parent_items: false,
            flatten: false,
        })
        .unwrap();
    assert_eq!(trimmed.selected_fields, vec!["[].id"]);
    assert_eq!(trimmed.total_groups, 1);
}

#[test]
fn values_explorer_service_rejects_explosive_match_combinations() {
    let service = JsonAnalyzerService::default();
    let long_array = (0..101)
        .map(|index| index.to_string())
        .collect::<Vec<_>>()
        .join(",");
    let input =
        format!(r#"[{{"left":[{long_array}],"right":[{long_array}]}},{{"left":[0],"right":[0]}}]"#);

    let error = service
        .analyze_values(ValuesAnalysisRequest {
            json_string: input,
            selected_fields: vec!["[].left.[]".to_string(), "[].right.[]".to_string()],
            search: None,
            sort: ValuesSort {
                by: ValuesSortBy::Count,
                direction: SortDirection::Desc,
            },
            page: 1,
            page_size: 10,
            include_parent_items: false,
            flatten: false,
        })
        .unwrap_err();

    assert_eq!(error.problem.error_type, "invalid_request");
    assert_eq!(error.problem.invalid_params[0].name, "selected_fields");
    assert!(
        error
            .problem
            .detail
            .contains("match combinations exceed limit")
    );
    assert!(error.problem.detail.contains("record 0"));
    assert!(error.problem.detail.contains("10201 combinations"));
}

#[test]
fn values_explorer_target_endpoint_rejects_ambiguous_composite_fields() {
    let service = JsonAnalyzerService::default();
    let input = r#"[
      {"id": 1, "department": "Engineering", "tags": ["api", "backend"]},
      {"id": 2, "department": "Engineering", "tags": ["api"]}
    ]"#;

    let error = service
        .analyze_values_explorer(ValuesExplorerAnalysisRequest {
            json_string: input.to_string(),
            selected_fields: vec!["[].department".to_string(), "[].tags.[]".to_string()],
            filter: None,
            sort_mode: ValuesExplorerSortMode::Frequency,
            page: 1,
            groups_page: None,
            page_size: 10,
            flatten: false,
        })
        .unwrap_err();

    assert_eq!(error.problem.error_type, "invalid_request");
    assert_eq!(error.problem.invalid_params[0].name, "selected_fields");
    assert!(
        error
            .problem
            .detail
            .contains("ambiguous for composite matching")
    );
    assert!(error.problem.detail.contains("record 0"));
    assert!(error.problem.detail.contains("[].tags.[]"));

    let single_field = service
        .analyze_values_explorer(ValuesExplorerAnalysisRequest {
            json_string: input.to_string(),
            selected_fields: vec!["[].tags.[]".to_string()],
            filter: None,
            sort_mode: ValuesExplorerSortMode::Frequency,
            page: 1,
            groups_page: None,
            page_size: 10,
            flatten: false,
        })
        .unwrap();

    assert_eq!(single_field.unique_values, 2);
    assert_eq!(single_field.duplicate_group_count, 1);
}

#[test]
fn values_explorer_service_rejects_large_total_match_combinations() {
    let service = JsonAnalyzerService::default();
    let long_array = (0..100)
        .map(|index| index.to_string())
        .collect::<Vec<_>>()
        .join(",");
    let record = format!(r#"{{"left":[{long_array}],"right":[{long_array}]}}"#);
    let input = format!(
        "[{}]",
        std::iter::repeat(record)
            .take(11)
            .collect::<Vec<_>>()
            .join(",")
    );

    let error = service
        .analyze_values(ValuesAnalysisRequest {
            json_string: input,
            selected_fields: vec!["[].left.[]".to_string(), "[].right.[]".to_string()],
            search: None,
            sort: ValuesSort {
                by: ValuesSortBy::Count,
                direction: SortDirection::Desc,
            },
            page: 1,
            page_size: 10,
            include_parent_items: false,
            flatten: false,
        })
        .unwrap_err();

    assert_eq!(error.problem.error_type, "invalid_request");
    assert_eq!(error.problem.invalid_params[0].name, "selected_fields");
    assert!(error.problem.detail.contains("for request"));
    assert!(error.problem.detail.contains("110000 combinations"));
}
