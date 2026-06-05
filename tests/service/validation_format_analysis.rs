use json_analyzer::*;

use crate::support::{
    EXACT_DUPLICATES_INPUT, FIELD_DUPLICATES_INPUT, GOLDEN, MIN_MAX_INPUT, STRUCTURE_INPUT,
};

#[test]
fn validate_accepts_single_root_and_rejects_fixture_invalid_cases() {
    assert!(GOLDEN.contains("valid_single_root"));
    let service = JsonAnalyzerService::default();

    let response = service
        .validate(ValidateRequest {
            json_string: r#"{"users":[{"id":1,"name":"Alice"}],"count":1}"#.to_string(),
        })
        .unwrap();

    assert!(response.valid);
    assert_eq!(response.document_count, 1);
    assert_eq!(
        response.compact_json,
        r#"{"users":[{"id":1,"name":"Alice"}],"count":1}"#
    );
    assert!(response.warnings.is_empty());

    let invalid = service
        .validate(ValidateRequest {
            json_string: r#"{"users":[{"id":1,}]}"#.to_string(),
        })
        .unwrap_err();
    assert_eq!(invalid.problem.error_type, "json_parse_error");
    assert_eq!(invalid.problem.status, Some(400));
    assert!(invalid.problem.position.is_some());

    let concatenated = service
        .validate(ValidateRequest {
            json_string: "{\"id\":1}\n{\"id\":2}".to_string(),
        })
        .unwrap_err();
    assert_eq!(concatenated.problem.error_type, "json_parse_error");
    assert!(
        concatenated
            .problem
            .detail
            .contains("trailing characters after JSON root")
    );
}

#[test]
fn analyze_wraps_structure_statistics_fields_duplicates_and_minmax() {
    let service = JsonAnalyzerService::default();
    let response = service
        .analyze(AnalyzeRequest {
            json_string: STRUCTURE_INPUT.to_string(),
            min_max_deep: true,
            flatten: false,
        })
        .unwrap();

    assert_eq!(response.structure.value_type, "dict");
    assert_eq!(response.structure.field_count, 18);
    assert_eq!(response.statistics.total_fields, 18);
    assert_eq!(response.statistics.null_count, 1);
    assert_eq!(response.statistics.unique_field_paths, 18);
    assert!(
        response
            .fields
            .iter()
            .any(|field| field.pattern == "users.[].profile.email")
    );
    assert_eq!(response.exact_duplicates.has_duplicates, false);
    assert_eq!(response.min_max_filled.has_records, true);
}

#[test]
fn get_fields_matches_source_derived_field_pattern_fixture() {
    let service = JsonAnalyzerService::default();
    let response = service
        .get_fields(GetFieldsRequest {
            json_string: STRUCTURE_INPUT.to_string(),
        })
        .unwrap();

    let department = response
        .fields
        .iter()
        .find(|field| field.pattern == "users.[].department")
        .expect("department field pattern");
    assert_eq!(department.label, "Users Department");
    assert_eq!(department.category, "[]");
    assert_eq!(department.count, 3);
}

#[test]
fn find_duplicates_supports_exact_and_field_modes() {
    let service = JsonAnalyzerService::default();

    let exact = service
        .find_duplicates(FindDuplicatesRequest {
            json_string: EXACT_DUPLICATES_INPUT.to_string(),
            field_path: None,
            case_sensitive: true,
        })
        .unwrap();
    let DuplicatesResponse::Exact { result } = exact else {
        panic!("expected exact duplicate response");
    };
    assert_eq!(result.analysis_path, "data (6 items)");
    assert_eq!(result.total_items, 3);
    assert_eq!(result.duplicates[0].value, r#"{"id":1,"name":"Alice"}"#);
    assert_eq!(result.duplicates[0].indexes, vec![0, 2]);

    let field = service
        .find_duplicates(FindDuplicatesRequest {
            json_string: FIELD_DUPLICATES_INPUT.to_string(),
            field_path: Some("[].department".to_string()),
            case_sensitive: false,
        })
        .unwrap();
    let DuplicatesResponse::Field { result } = field else {
        panic!("expected field duplicate response");
    };
    assert_eq!(result.field_path, "[].department");
    assert_eq!(result.total_items, 4);
    assert_eq!(result.unique_values, 2);
    assert_eq!(result.duplicates[0].value, "engineering");
    assert_eq!(
        result.duplicates[0].source_paths,
        vec!["0.department", "1.department", "4.department"]
    );
}

#[test]
fn min_max_filled_exposes_deep_and_shallow_service_results() {
    let service = JsonAnalyzerService::default();

    let deep = service
        .min_max_filled(MinMaxRequest {
            json_string: MIN_MAX_INPUT.to_string(),
            deep: true,
        })
        .unwrap();
    assert_eq!(deep.analysis_path, "root");
    assert_eq!(deep.min_records[0].filled_count, 2);
    assert_eq!(deep.max_records[0].filled_count, 7);

    let shallow = service
        .min_max_filled(MinMaxRequest {
            json_string: MIN_MAX_INPUT.to_string(),
            deep: false,
        })
        .unwrap();
    assert_eq!(shallow.min_records[0].filled_count, 3);
    assert_eq!(shallow.max_records[0].filled_count, 5);
}

#[test]
fn format_json_preserves_duplicate_keys_and_uses_strict_validation() {
    let service = JsonAnalyzerService::default();
    let formatted = service
        .format_json(FormatRequest {
            json_string: r#"{"id":1,"id":2,"items":[true,null]}"#.to_string(),
        })
        .unwrap();

    assert_eq!(
        formatted.formatted_json,
        "{\n  \"id\": 1,\n  \"id\": 2,\n  \"items\": [\n    true,\n    null\n  ]\n}"
    );

    let concatenated = service
        .format_json(FormatRequest {
            json_string: "{\"id\":1}\n{\"id\":2}".to_string(),
        })
        .unwrap_err();
    assert_eq!(concatenated.problem.error_type, "json_parse_error");
}

#[test]
fn analyze_flatten_option_is_one_level_root_list_of_lists_only() {
    let service = JsonAnalyzerService::default();
    let input = r#"[[{"id":1,"name":"Alice"},{"id":1,"name":"Alice"}],[],[{"id":2,"name":"Bob"}]]"#;

    let default_analysis = service
        .analyze(AnalyzeRequest {
            json_string: input.to_string(),
            min_max_deep: true,
            flatten: false,
        })
        .unwrap();
    assert!(
        default_analysis
            .structure
            .container_summary
            .is_list_of_lists
    );
    assert_eq!(
        default_analysis
            .structure
            .container_summary
            .flattened_one_level_items,
        3
    );

    let flattened = service
        .analyze(AnalyzeRequest {
            json_string: input.to_string(),
            min_max_deep: true,
            flatten: true,
        })
        .unwrap();
    assert!(!flattened.structure.container_summary.is_list_of_lists);
    assert_eq!(flattened.structure.size, 3);
    assert_eq!(flattened.exact_duplicates.duplicates[0].indexes, vec![0, 1]);
    assert_eq!(flattened.min_max_filled.total_records, 3);

    let validation = service
        .validate(ValidateRequest {
            json_string: input.to_string(),
        })
        .unwrap();
    assert_eq!(validation.document_count, 1);
    assert_eq!(validation.compact_json, input.replace(' ', ""));
}
