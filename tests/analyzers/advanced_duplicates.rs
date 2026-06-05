use crate::support::VALUES_SHARED_DATASET;
use json_analyzer::{
    DuplicateFilter, analyze_advanced_field_duplicates, analyze_composite_duplicates, parse_json,
};
use serde_json::json;

#[test]
fn advanced_field_duplicates_match_filtered_source_contract() {
    let value = parse_json(VALUES_SHARED_DATASET).unwrap();
    let response = analyze_advanced_field_duplicates(
        &value,
        "[].department",
        Some(&DuplicateFilter {
            field_path: "[].status".to_string(),
            value: json!("active"),
        }),
        false,
        true,
        1,
        10,
    );

    assert_eq!(response.field_path, "[].department");
    assert_eq!(response.total_items_considered, 6);
    assert_eq!(response.duplicate_group_count, 2);
    assert!(!response.has_next_page);
    assert_eq!(response.duplicates.len(), 2);

    let engineering = &response.duplicates[0];
    assert_eq!(engineering.value, json!("engineering"));
    assert_eq!(engineering.display_value, "Engineering");
    assert_eq!(engineering.count, 3);
    assert_eq!(engineering.record_indexes, vec![0, 1, 4]);
    assert_eq!(
        engineering.source_paths,
        vec!["0.department", "1.department", "4.department"]
    );
    assert_eq!(engineering.parent_items.len(), 3);
    assert_eq!(engineering.parent_items[0].record_index, 0);
    assert_eq!(engineering.parent_items[0].summary["id"], json!(1));
    assert_eq!(engineering.parent_items[0].summary["name"], json!("Alice"));
    assert_eq!(
        engineering.parent_items[0].summary["status"],
        json!("active")
    );
    assert!(
        !engineering.parent_items[0]
            .summary
            .contains_key("department")
    );

    let design = &response.duplicates[1];
    assert_eq!(design.value, json!("design"));
    assert_eq!(design.count, 2);
    assert_eq!(design.record_indexes, vec![2, 7]);

    assert_eq!(response.all_values_summary.len(), 3);
    assert_eq!(response.all_values_summary[0].value, json!("engineering"));
    assert!(response.all_values_summary[0].is_duplicate);
    assert_eq!(response.all_values_summary[1].value, json!("design"));
    assert!(response.all_values_summary[1].is_duplicate);
    assert_eq!(response.all_values_summary[2].value, json!("support"));
    assert!(!response.all_values_summary[2].is_duplicate);
}

#[test]
fn advanced_duplicates_accept_full_field_patterns_for_nested_record_candidates() {
    let value = parse_json(
        r#"{
          "users": [
            {"id":1,"department":"Engineering","role":"Developer","status":"active"},
            {"id":2,"department":"Engineering","role":"Developer","status":"active"},
            {"id":3,"department":"Design","role":"Designer","status":"inactive"}
          ]
        }"#,
    )
    .unwrap();

    let field = analyze_advanced_field_duplicates(
        &value,
        "users.[].department",
        Some(&DuplicateFilter {
            field_path: " users.[].status ".to_string(),
            value: json!("active"),
        }),
        true,
        false,
        1,
        10,
    );
    assert_eq!(field.total_items_considered, 2);
    assert_eq!(field.duplicate_group_count, 1);
    assert_eq!(
        field.duplicates[0].source_paths,
        vec!["0.department", "1.department"]
    );

    let composite = analyze_composite_duplicates(
        &value,
        &[
            "users.[].department".to_string(),
            "users.[].role".to_string(),
        ],
        None,
        true,
        false,
        1,
        10,
    );
    assert_eq!(composite.duplicate_group_count, 1);
    assert_eq!(
        composite.duplicates[0].key,
        vec![json!("Engineering"), json!("Developer")]
    );
}

#[test]
fn composite_duplicates_match_source_contract_and_paginate() {
    let value = parse_json(VALUES_SHARED_DATASET).unwrap();
    let field_paths = vec!["[].department".to_string(), "[].role".to_string()];
    let response = analyze_composite_duplicates(&value, &field_paths, None, true, true, 1, 2);

    assert_eq!(response.field_paths, field_paths);
    assert_eq!(response.duplicate_group_count, 3);
    assert!(response.has_next_page);
    assert_eq!(response.duplicates.len(), 2);

    let engineering_developer = &response.duplicates[0];
    assert_eq!(
        engineering_developer.key,
        vec![json!("Engineering"), json!("Developer")]
    );
    assert_eq!(engineering_developer.count, 3);
    assert_eq!(engineering_developer.record_indexes, vec![0, 1, 4]);
    assert_eq!(
        engineering_developer.source_paths,
        vec![
            "0.department",
            "0.role",
            "1.department",
            "1.role",
            "4.department",
            "4.role"
        ]
    );
    assert_eq!(
        engineering_developer.parent_items[0].summary["id"],
        json!(1)
    );
    assert_eq!(
        engineering_developer.parent_items[0].summary["department"],
        json!("Engineering")
    );
    assert_eq!(
        engineering_developer.parent_items[0].summary["role"],
        json!("Developer")
    );

    let design_designer = &response.duplicates[1];
    assert_eq!(
        design_designer.key,
        vec![json!("Design"), json!("Designer")]
    );
    assert_eq!(design_designer.record_indexes, vec![2, 7]);

    let second_page =
        analyze_composite_duplicates(&value, &response.field_paths, None, true, false, 2, 2);
    assert!(!second_page.has_next_page);
    assert_eq!(second_page.duplicates.len(), 1);
    assert_eq!(
        second_page.duplicates[0].key,
        vec![json!("Support"), json!("Analyst")]
    );
    assert!(second_page.duplicates[0].parent_items.is_empty());
}

#[test]
fn advanced_duplicates_preserve_duplicate_key_observations_and_source_paths() {
    let value = parse_json(
        r#"[
          {"id": 1, "id": 2, "department": "Engineering"},
          {"id": 1, "id": 2, "department": "Engineering"},
          {"id": 2, "id": 1, "department": "Engineering"}
        ]"#,
    )
    .unwrap();

    let field = analyze_advanced_field_duplicates(&value, "[].id", None, true, false, 1, 10);
    assert_eq!(field.total_items_considered, 6);
    assert_eq!(field.duplicate_group_count, 2);
    assert_eq!(field.duplicates[0].value, json!(1));
    assert_eq!(field.duplicates[0].count, 3);
    assert_eq!(
        field.duplicates[0].source_paths,
        vec!["0.id#1", "1.id#1", "2.id#2"]
    );
    assert_eq!(field.duplicates[1].value, json!(2));
    assert_eq!(
        field.duplicates[1].source_paths,
        vec!["0.id#2", "1.id#2", "2.id#1"]
    );

    let composite = analyze_composite_duplicates(
        &value,
        &["[].id".to_string(), "[].department".to_string()],
        None,
        true,
        false,
        1,
        10,
    );
    assert_eq!(composite.duplicate_group_count, 2);
    assert_eq!(
        composite.duplicates[0].key,
        vec![json!(1), json!("Engineering")]
    );
    assert_eq!(composite.duplicates[0].count, 3);
    assert_eq!(
        composite.duplicates[0].source_paths,
        vec![
            "0.id#1",
            "0.department",
            "1.id#1",
            "1.department",
            "2.id#2",
            "2.department"
        ]
    );
}
