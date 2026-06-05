use crate::support::VALUES_SHARED_DATASET;
use json_analyzer::{
    SortDirection, ValuesSort, ValuesSortBy, analyze_values, discover_values_fields, parse_json,
};
use serde_json::json;

#[test]
fn values_field_discovery_matches_item_5_contract() {
    let value = parse_json(VALUES_SHARED_DATASET).unwrap();
    let all_fields = discover_values_fields(&value, None, None);
    assert!(
        all_fields
            .fields
            .iter()
            .any(|field| field.field_path == "[].tags.[]")
    );
    assert!(
        !all_fields
            .fields
            .iter()
            .any(|field| field.field_path == "[].tags"),
        "empty arrays should not be surfaced as separate Values Explorer fields"
    );

    let response = discover_values_fields(&value, Some("dep"), Some(10));

    assert_eq!(response.fields.len(), 1);
    let department = &response.fields[0];
    assert_eq!(department.field_path, "[].department");
    assert_eq!(department.label, "Department");
    assert_eq!(department.type_hints, vec!["str"]);
    assert_eq!(department.non_null_count, 8);
    assert_eq!(department.null_count, 0);
    assert_eq!(department.missing_count, 0);
    assert_eq!(department.unique_value_count, 3);
    assert_eq!(
        department.sample_values,
        vec![json!("Engineering"), json!("Design"), json!("Support")]
    );
}

#[test]
fn values_single_field_counts_parent_items_and_paginates_like_contract() {
    let value = parse_json(VALUES_SHARED_DATASET).unwrap();
    let response = analyze_values(
        &value,
        &["[].department".to_string()],
        None,
        ValuesSort {
            by: ValuesSortBy::Count,
            direction: SortDirection::Desc,
        },
        1,
        2,
        true,
    );

    assert_eq!(response.selected_fields, vec!["[].department"]);
    assert_eq!(response.total_groups, 3);
    assert_eq!(response.page, 1);
    assert_eq!(response.page_size, 2);
    assert!(response.has_next_page);
    assert_eq!(response.groups.len(), 2);

    let engineering = &response.groups[0];
    assert_eq!(engineering.key, vec![json!("Engineering")]);
    assert_eq!(engineering.display_value, "Engineering");
    assert_eq!(engineering.count, 4);
    assert_eq!(
        engineering.source_paths,
        vec![
            "0.department",
            "1.department",
            "3.department",
            "4.department"
        ]
    );
    assert_eq!(engineering.record_indexes, vec![0, 1, 3, 4]);
    assert_eq!(engineering.parent_items.len(), 4);
    assert_eq!(engineering.parent_items[0].record_index, 0);
    assert_eq!(
        engineering.parent_items[0].source_path.as_deref(),
        Some("0")
    );
    assert_eq!(engineering.parent_items[0].summary["id"], json!(1));
    assert_eq!(engineering.parent_items[0].summary["name"], json!("Alice"));
    assert_eq!(
        engineering.parent_items[0].summary["department"],
        json!("Engineering")
    );

    let design = &response.groups[1];
    assert_eq!(design.key, vec![json!("Design")]);
    assert_eq!(design.count, 2);
    assert_eq!(design.source_paths, vec!["2.department", "7.department"]);
}

#[test]
fn values_search_sort_multi_field_and_pagination_boundaries_are_deterministic() {
    let value = parse_json(VALUES_SHARED_DATASET).unwrap();

    let searched = analyze_values(
        &value,
        &["[].department".to_string()],
        Some("sup"),
        ValuesSort {
            by: ValuesSortBy::Value,
            direction: SortDirection::Asc,
        },
        1,
        10,
        false,
    );
    assert_eq!(searched.total_groups, 1);
    assert_eq!(searched.groups[0].key, vec![json!("Support")]);
    assert_eq!(searched.groups[0].count, 2);
    assert_eq!(
        searched.groups[0].source_paths,
        vec!["5.department", "6.department"]
    );

    let multi = analyze_values(
        &value,
        &["[].department".to_string(), "[].role".to_string()],
        None,
        ValuesSort {
            by: ValuesSortBy::Count,
            direction: SortDirection::Desc,
        },
        1,
        10,
        false,
    );
    assert_eq!(multi.total_groups, 4);
    assert_eq!(
        multi.groups[0].key,
        vec![json!("Engineering"), json!("Developer")]
    );
    assert_eq!(multi.groups[0].count, 3);
    assert_eq!(multi.groups[0].record_indexes, vec![0, 1, 4]);
    assert_eq!(
        multi.groups[1].key,
        vec![json!("Design"), json!("Designer")]
    );
    assert_eq!(
        multi.groups[2].key,
        vec![json!("Support"), json!("Analyst")]
    );
    assert_eq!(
        multi.groups[3].key,
        vec![json!("Engineering"), json!("Manager")]
    );

    let out_of_range = analyze_values(
        &value,
        &["[].department".to_string()],
        None,
        ValuesSort {
            by: ValuesSortBy::Count,
            direction: SortDirection::Desc,
        },
        3,
        2,
        false,
    );
    assert_eq!(out_of_range.total_groups, 3);
    assert!(!out_of_range.has_next_page);
    assert!(out_of_range.groups.is_empty());
}

#[test]
fn values_include_null_exclude_missing_and_report_sparse_nested_field_counts() {
    let value = parse_json(VALUES_SHARED_DATASET).unwrap();
    let discovery = discover_values_fields(&value, Some("email"), None);
    let email = discovery
        .fields
        .iter()
        .find(|field| field.field_path == "[].profile.email")
        .unwrap();
    assert_eq!(email.non_null_count, 6);
    assert_eq!(email.null_count, 1);
    assert_eq!(email.missing_count, 1);
    assert_eq!(email.type_hints, vec!["str"]);

    let values = analyze_values(
        &value,
        &["[].profile.email".to_string()],
        None,
        ValuesSort {
            by: ValuesSortBy::FirstSourcePath,
            direction: SortDirection::Asc,
        },
        1,
        10,
        false,
    );
    assert_eq!(values.total_groups, 7);
    assert_eq!(values.groups[0].key, vec![json!("alice@example.com")]);
    assert_eq!(values.groups[1].key, vec![json!(null)]);
    assert_eq!(values.groups[1].display_value, "null");
    assert_eq!(values.groups[1].source_paths, vec!["1.profile.email"]);
    assert!(
        !values
            .groups
            .iter()
            .any(|group| group.source_paths == vec!["7.profile.email"])
    );
}

#[test]
fn values_array_fields_use_nearest_array_record_parent_semantics() {
    let value = parse_json(VALUES_SHARED_DATASET).unwrap();
    let response = analyze_values(
        &value,
        &["[].tags.[]".to_string()],
        None,
        ValuesSort {
            by: ValuesSortBy::Count,
            direction: SortDirection::Desc,
        },
        1,
        10,
        true,
    );

    let qa = response
        .groups
        .iter()
        .find(|group| group.key == vec![json!("qa")])
        .expect("qa group");
    assert_eq!(qa.count, 3);
    assert_eq!(qa.source_paths, vec!["0.tags.1", "1.tags.0", "4.tags.0"]);
    assert_eq!(qa.record_indexes, vec![0, 1, 4]);
    assert_eq!(qa.parent_items[0].record_index, 0);
    assert_eq!(qa.parent_items[0].source_path.as_deref(), Some("0"));
    assert_eq!(qa.parent_items[0].summary["id"], json!(1));
}

#[test]
fn values_preserve_duplicate_keys_as_distinct_observations() {
    let value = parse_json(
        r#"[
          {"id": 1, "id": 2, "department": "Engineering"},
          {"id": 1, "id": 2, "department": "Engineering"},
          {"id": 2, "id": 1, "department": "Engineering"}
        ]"#,
    )
    .unwrap();

    let discovery = discover_values_fields(&value, Some("id"), None);
    let id = discovery
        .fields
        .iter()
        .find(|field| field.field_path == "[].id")
        .unwrap();
    assert_eq!(id.non_null_count, 6);
    assert_eq!(id.missing_count, 0);
    assert_eq!(id.unique_value_count, 2);

    let response = analyze_values(
        &value,
        &["[].id".to_string()],
        None,
        ValuesSort {
            by: ValuesSortBy::Count,
            direction: SortDirection::Desc,
        },
        1,
        10,
        false,
    );
    assert_eq!(response.total_groups, 2);
    assert_eq!(response.groups[0].key, vec![json!(1)]);
    assert_eq!(response.groups[0].count, 3);
    assert_eq!(
        response.groups[0].source_paths,
        vec!["0.id#1", "1.id#1", "2.id#2"]
    );
    assert_eq!(response.groups[1].key, vec![json!(2)]);
    assert_eq!(response.groups[1].count, 3);
    assert_eq!(
        response.groups[1].source_paths,
        vec!["0.id#2", "1.id#2", "2.id#1"]
    );
}

#[test]
fn values_repeated_duplicate_key_source_paths_are_unambiguous() {
    let value = parse_json(r#"[{"id":1,"id":1},{"id":2}]"#).unwrap();

    let response = analyze_values(
        &value,
        &["[].id".to_string()],
        None,
        ValuesSort {
            by: ValuesSortBy::FirstSourcePath,
            direction: SortDirection::Asc,
        },
        1,
        10,
        false,
    );

    assert_eq!(response.total_groups, 2);
    assert_eq!(response.groups[0].key, vec![json!(1)]);
    assert_eq!(response.groups[0].count, 2);
    assert_eq!(response.groups[0].source_paths, vec!["0.id#1", "0.id#2"]);
}
