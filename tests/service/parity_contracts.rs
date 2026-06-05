use crate::support::PARITY_CONTRACTS;

#[test]
fn full_source_parity_contract_fixture_locks_item_1_foundation() {
    let fixture: serde_json::Value = serde_json::from_str(PARITY_CONTRACTS).unwrap();

    assert_eq!(fixture["metadata"]["data_only"].as_bool(), Some(true));
    assert_eq!(fixture["shared_dataset"]["record_count"].as_u64(), Some(8));
    assert_eq!(
        fixture["shared_dataset"]["duplicate_key_target_expectation"]
            ["exact_duplicate_group_value"]
            .as_str(),
        Some(r#"{"id":1,"id":2,"department":"Engineering"}"#)
    );

    let input_decisions = &fixture["json_input_ux"]["target_decisions"];
    assert_eq!(
        input_decisions["flatten_semantics"].as_str(),
        Some("one_level_only_when_analysis_root_is_list_of_lists")
    );
    assert_eq!(
        input_decisions["validation_mode"].as_str(),
        Some("strict_single_root_unchanged")
    );
    assert_eq!(
        input_decisions["recursive_flattening"].as_bool(),
        Some(false)
    );
    assert_eq!(
        fixture["json_input_ux"]["flatten_contract"]["expected_analysis_notes"]["structure_size"]
            .as_u64(),
        Some(3)
    );

    let values_decisions = &fixture["values_explorer"]["target_decisions"];
    assert_eq!(values_decisions["field_selection_max"].as_u64(), Some(5));
    assert_eq!(values_decisions["page_base"].as_u64(), Some(1));
    assert_eq!(
        fixture["values_explorer"]["single_field_values_contract"]["expected_response"]["groups"]
            [0]["display_value"]
            .as_str(),
        Some("Engineering")
    );
    assert_eq!(
        fixture["values_explorer"]["single_field_values_contract"]["expected_response"]["groups"]
            [0]["count"]
            .as_u64(),
        Some(4)
    );

    let advanced_duplicates = &fixture["advanced_duplicates"];
    assert_eq!(
        advanced_duplicates["composite_duplicates_contract"]["expected_response"]
            ["duplicate_group_count"]
            .as_u64(),
        Some(3)
    );
    assert_eq!(
        advanced_duplicates["composite_duplicates_contract"]["expected_response"]["duplicates"][0]
            ["parent_items"]
            .as_array()
            .unwrap()
            .len(),
        3
    );
    assert_eq!(
        advanced_duplicates["single_field_with_filter_contract"]["expected_response"]
            ["all_values_summary"][2]["is_duplicate"]
            .as_bool(),
        Some(false)
    );
    assert!(
        advanced_duplicates["validation_error_contracts"]
            .as_array()
            .unwrap()
            .iter()
            .any(|case| case["case"] == "too_few_composite_fields")
    );

    let curl_examples = fixture["curl_executor"]["parser_examples"]
        .as_array()
        .unwrap();
    let post_with_bearer = curl_examples
        .iter()
        .find(|example| example["case"] == "post_json_with_bearer")
        .expect("post_json_with_bearer fixture");
    assert_eq!(
        post_with_bearer["expected_parse"]["headers"][0]["value"].as_str(),
        Some("Bearer ***")
    );
    assert_eq!(
        post_with_bearer["expected_parse"]["auth"]["bearer_token_present"].as_bool(),
        Some(true)
    );

    let guardrails = fixture["curl_executor"]["guardrail_outcomes"]
        .as_array()
        .unwrap();
    assert!(guardrails.iter().any(|outcome| {
        outcome["case"] == "deny_private_ipv4"
            && outcome["expected_decision"]["allowed"].as_bool() == Some(false)
    }));

    assert_eq!(
        fixture["config"]["expanded_frontend_consumed_config_contract"]["limits"]
            ["values_explorer"]["page_sizes"]
            .as_array()
            .unwrap()
            .len(),
        4
    );
    let config_features =
        &fixture["config"]["expanded_frontend_consumed_config_contract"]["features"];
    assert_eq!(config_features["pdf_export"].as_bool(), Some(false));
    assert_eq!(
        config_features["curl_single_request_execution"].as_bool(),
        Some(true)
    );
    assert_eq!(config_features["curl_jobs"].as_bool(), Some(true));
    assert_eq!(config_features["curl_batch"].as_bool(), Some(true));
    assert_eq!(config_features["curl_cancel"].as_bool(), Some(true));
    assert_eq!(
        fixture["error_shapes"]["examples"][2]["problem"]["error_type"].as_str(),
        Some("curl_guardrail_denied")
    );
    let deferred_items = fixture["deliberate_deferred_items"].as_array().unwrap();
    assert!(deferred_items.iter().any(|item| {
        item.as_str()
            .unwrap()
            .contains("HTTP/OpenAPI remains a future optional adapter")
    }));
    assert!(deferred_items.iter().any(|item| {
        item.as_str()
            .unwrap()
            .contains("No SQLite job persistence fixture")
    }));
}
