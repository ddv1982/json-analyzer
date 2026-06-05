use crate::support::{EXACT_DUPLICATES_INPUT, FIELD_DUPLICATES_INPUT};
use json_analyzer::{analyze_exact_duplicates, analyze_field_duplicates, parse_json};

#[test]
fn exact_duplicates_use_best_array_and_compact_ast_group_keys() {
    let value = parse_json(EXACT_DUPLICATES_INPUT).unwrap();
    let result = analyze_exact_duplicates(&value);

    assert_eq!(result.analysis_path, "data (6 items)");
    assert_eq!(result.total_items, 3);
    assert_eq!(result.unique_items, 2);
    assert_eq!(result.duplicate_groups, 1);
    assert!(result.has_duplicates);
    assert_eq!(result.duplicates.len(), 1);
    assert_eq!(result.duplicates[0].value, r#"{"id":1,"name":"Alice"}"#);
    assert_eq!(result.duplicates[0].indexes, vec![0, 2]);
}

#[test]
fn exact_duplicates_prefer_object_arrays_over_large_scalar_arrays() {
    let value = parse_json(
        r#"{
          "records": [{"id": 1}, {"id": 1}],
          "data": [1, 1, 1, 1, 1, 1, 1, 1]
        }"#,
    )
    .unwrap();

    let result = analyze_exact_duplicates(&value);
    assert_eq!(result.analysis_path, "records (2 items)");
    assert_eq!(result.duplicates[0].value, r#"{"id":1}"#);
    assert_eq!(result.duplicates[0].indexes, vec![0, 1]);
}

#[test]
fn field_duplicates_skip_null_missing_and_support_case_modes() {
    let value = parse_json(FIELD_DUPLICATES_INPUT).unwrap();

    let departments = analyze_field_duplicates(&value, "[].department", false);
    assert_eq!(departments.field_path, "[].department");
    assert_eq!(departments.total_items, 4);
    assert_eq!(departments.unique_values, 2);
    assert_eq!(departments.duplicate_count, 1);
    assert!(departments.has_duplicates);
    assert_eq!(departments.duplicates[0].value, "engineering");
    assert_eq!(departments.duplicates[0].count, 3);
    assert_eq!(
        departments.duplicates[0].source_paths,
        vec!["0.department", "1.department", "4.department"]
    );
    assert_eq!(departments.all_values_summary[0].value, "engineering");
    assert!(departments.all_values_summary[0].is_duplicate);
    assert_eq!(departments.all_values_summary[1].value, "design");
    assert!(!departments.all_values_summary[1].is_duplicate);

    let names_sensitive = analyze_field_duplicates(&value, "[].name", true);
    assert_eq!(names_sensitive.total_items, 5);
    assert_eq!(names_sensitive.unique_values, 5);
    assert_eq!(names_sensitive.duplicate_count, 0);
    assert!(!names_sensitive.has_duplicates);

    let names_insensitive = analyze_field_duplicates(&value, "[].name", false);
    assert_eq!(names_insensitive.total_items, 5);
    assert_eq!(names_insensitive.unique_values, 3);
    assert_eq!(names_insensitive.duplicate_count, 1);
    assert_eq!(names_insensitive.duplicates[0].value, "alice");
    assert_eq!(
        names_insensitive.duplicates[0].source_paths,
        vec!["0.name", "3.name", "4.name"]
    );
}

#[test]
fn exact_duplicates_preserve_duplicate_keys_and_object_member_order() {
    let value = parse_json(
        r#"{
          "records": [
            {"id": 1, "id": 2},
            {"id": 2, "id": 1},
            {"id": 1, "id": 2}
          ]
        }"#,
    )
    .unwrap();

    let result = analyze_exact_duplicates(&value);
    assert_eq!(result.analysis_path, "records (3 items)");
    assert_eq!(result.total_items, 3);
    assert_eq!(result.unique_items, 2);
    assert_eq!(result.duplicate_groups, 1);
    assert_eq!(result.duplicates[0].value, r#"{"id":1,"id":2}"#);
    assert_eq!(result.duplicates[0].indexes, vec![0, 2]);
}

#[test]
fn field_duplicates_can_match_container_values_at_pattern_path() {
    let value = parse_json(
        r#"[
          {"tags": ["a", "b"]},
          {"tags": ["a", "b"]},
          {"tags": ["c"]}
        ]"#,
    )
    .unwrap();

    let result = analyze_field_duplicates(&value, "[].tags", true);
    assert_eq!(result.total_items, 3);
    assert_eq!(result.unique_values, 2);
    assert_eq!(result.duplicate_count, 1);
    assert_eq!(result.duplicates[0].value, r#"["a","b"]"#);
    assert_eq!(result.duplicates[0].source_paths, vec!["0.tags", "1.tags"]);
}

#[test]
fn field_duplicates_skip_null_and_missing_values_in_sparse_records() {
    let value = parse_json(
        r#"[
          {"email": "a@example.com"},
          {"name": "missing email"},
          {"email": null},
          {"email": "A@example.com"},
          {"email": "b@example.com"},
          {"email": "a@example.com"}
        ]"#,
    )
    .unwrap();

    let insensitive = analyze_field_duplicates(&value, "[].email", false);
    assert_eq!(insensitive.total_items, 4);
    assert_eq!(insensitive.unique_values, 2);
    assert_eq!(insensitive.duplicate_count, 1);
    assert_eq!(insensitive.duplicates[0].value, "a@example.com");
    assert_eq!(
        insensitive.duplicates[0].source_paths,
        vec!["0.email", "3.email", "5.email"]
    );

    let sensitive = analyze_field_duplicates(&value, "[].email", true);
    assert_eq!(sensitive.total_items, 4);
    assert_eq!(sensitive.unique_values, 3);
    assert_eq!(sensitive.duplicate_count, 1);
    assert_eq!(
        sensitive.duplicates[0].source_paths,
        vec!["0.email", "5.email"]
    );
}
