use json_analyzer::{
    JsonNumber, JsonValue, analyze_structure, collect_field_patterns, flatten,
    flatten_one_level_if_list_of_lists, flatten_paths, parse_json, parse_json_documents,
    parse_json_with_max_depth, safe_str,
};

#[test]
fn duplicate_key_fixture_preserves_members_in_order() {
    let input = include_str!("fixtures/inputs/duplicate-keys.json.txt");
    let value = parse_json(input).unwrap();

    let JsonValue::Object(members) = &value else {
        panic!("expected object root");
    };

    assert_eq!(members.len(), 3);
    assert_eq!(members[0].0, "id");
    assert_eq!(safe_str(&members[0].1), "1");
    assert_eq!(members[1].0, "id");
    assert_eq!(safe_str(&members[1].1), "2");
    assert_eq!(members[2].0, "name");
    assert_eq!(safe_str(&members[2].1), "last wins in source");
    assert_eq!(
        value.compact_json(),
        "{\"id\":1,\"id\":2,\"name\":\"last wins in source\"}"
    );
}

#[test]
fn concatenated_root_behavior_is_explicit() {
    let input = include_str!("fixtures/inputs/concatenated-roots.json.txt");

    let strict_error = parse_json(input).unwrap_err();
    assert_eq!(strict_error.message, "trailing characters after JSON root");

    let documents = parse_json_documents(input).unwrap();
    assert_eq!(documents.len(), 2);
    assert_eq!(documents[0].compact_json(), "{\"id\":1}");
    assert_eq!(documents[1].compact_json(), "{\"id\":2}");
}

#[test]
fn field_path_fixture_matches_source_style_paths_and_patterns() {
    let input = include_str!("fixtures/inputs/field-patterns.json.txt");
    let value = parse_json(input).unwrap();

    assert_eq!(
        flatten_paths(&value),
        vec![
            "users.0.id",
            "users.0.department",
            "users.0.profile.email",
            "users.0.tags.0",
            "users.0.tags.1",
            "users.1.id",
            "users.1.department",
            "users.1.profile.email",
            "users.1.tags",
            "users.2.id",
            "users.2.department",
            "users.2.profile.email",
            "users.2.tags.0",
            "metadata.total",
            "metadata.source",
        ]
    );

    let entries = flatten(&value);
    let patterns = collect_field_patterns(&entries);

    let users_id = find_pattern(&patterns, "users.[].id");
    assert_eq!(users_id.label, "Users Id");
    assert_eq!(users_id.category, "Identifier");
    assert_eq!(
        users_id.sample_paths,
        vec!["users.0.id", "users.1.id", "users.2.id"]
    );
    assert_eq!(users_id.count, 3);

    let department = find_pattern(&patterns, "users.[].department");
    assert_eq!(department.label, "Users Department");
    assert_eq!(department.category, "[]");
    assert_eq!(department.count, 3);

    let email = find_pattern(&patterns, "users.[].profile.email");
    assert_eq!(email.label, "Profile Email");
    assert_eq!(email.category, "Profile");
    assert_eq!(email.count, 3);

    let tags = find_pattern(&patterns, "users.[].tags.[]");
    assert_eq!(tags.label, "Users Tags");
    assert_eq!(tags.category, "Tags");
    assert_eq!(
        tags.sample_paths,
        vec!["users.0.tags.0", "users.0.tags.1", "users.2.tags.0"]
    );
    assert_eq!(tags.count, 3);
}

#[test]
fn safe_str_and_compact_serialization_are_defined_from_ast() {
    let value = parse_json(
        "{\"null\":null,\"true\":true,\"false\":false,\"array\":[1,2],\"object\":{\"a\":1},\"string\":\"Alice\",\"integer\":42,\"float\":3.1400}",
    )
    .unwrap();
    let entries = flatten(&value);

    assert_eq!(safe_str(value_at(&entries, "null")), "null");
    assert_eq!(safe_str(value_at(&entries, "true")), "true");
    assert_eq!(safe_str(value_at(&entries, "false")), "false");
    assert_eq!(safe_str(value_at(&entries, "array.0")), "1");
    assert_eq!(safe_str(value_at(&entries, "string")), "Alice");
    assert_eq!(safe_str(value_at(&entries, "integer")), "42");
    assert_eq!(safe_str(value_at(&entries, "float")), "3.14");

    let JsonValue::Object(members) = &value else {
        panic!("expected object");
    };
    assert_eq!(safe_str(&members[3].1), "[1,2]");
    assert_eq!(safe_str(&members[4].1), "{\"a\":1}");
}

#[test]
fn parser_regressions_cover_mvp_source_edge_cases() {
    let whitespace = parse_json("  \n\t  ").unwrap_err();
    assert_eq!(whitespace.message, "expected JSON value");
    assert_eq!(whitespace.line, 2);

    let trailing = parse_json("[1, 2] true").unwrap_err();
    assert_eq!(trailing.message, "trailing characters after JSON root");

    assert_eq!(safe_str(&parse_json("true").unwrap()), "true");
    assert_eq!(safe_str(&parse_json("42").unwrap()), "42");

    let top_level_array = parse_json("[{\"id\":1}, {\"id\":2}]").unwrap();
    let JsonValue::Array(items) = top_level_array else {
        panic!("expected top-level array root");
    };
    assert_eq!(items.len(), 2);

    let documents = parse_json_documents("{\"id\":1}\n[2]\ntrue\n\"done\"").unwrap();
    assert_eq!(documents.len(), 4);
    assert_eq!(documents[0].compact_json(), "{\"id\":1}");
    assert_eq!(documents[1].compact_json(), "[2]");
    assert_eq!(safe_str(&documents[2]), "true");
    assert_eq!(safe_str(&documents[3]), "done");
}

#[test]
fn empty_arrays_are_not_list_of_lists() {
    let value = parse_json("[]").unwrap();
    let structure = analyze_structure(&value);

    assert!(!structure.container_summary.is_list_of_lists);
    assert_eq!(structure.container_summary.inner_arrays, 0);
    assert_eq!(structure.total_items, 0);
    assert!(flatten_one_level_if_list_of_lists(&value).is_none());
}

#[test]
fn parser_enforces_explicit_maximum_json_depth() {
    assert!(parse_json_with_max_depth("{\"items\":[1]}", 2).is_ok());

    let error = parse_json_with_max_depth("{\"items\":[[1]]}", 2).unwrap_err();
    assert!(error.is_depth_exceeded());
    assert_eq!(error.message, "JSON nesting exceeds maximum depth of 2");
}

#[test]
fn numeric_semantics_are_exact_and_non_finite_values_are_rejected() {
    let one = JsonNumber::parse("1").unwrap();
    let one_point_zero = JsonNumber::parse("1.0").unwrap();
    let one_exp = JsonNumber::parse("1e0").unwrap();
    let tenth = JsonNumber::parse("0.10").unwrap();
    let two_hundredths = JsonNumber::parse("0.02").unwrap();
    let large_integer = JsonNumber::parse("900719925474099312345").unwrap();
    let same_large_integer = JsonNumber::parse("900719925474099312345.0").unwrap();
    let small_exponent = JsonNumber::parse("1.25e-2").unwrap();

    assert_eq!(one, one_point_zero);
    assert_eq!(one, one_exp);
    assert_eq!(large_integer, same_large_integer);
    assert!(tenth > two_hundredths);
    assert_eq!(small_exponent.to_string(), "0.0125");
    assert_eq!(JsonNumber::parse("-0").unwrap().to_string(), "0");
    assert_eq!(JsonNumber::parse("1e3").unwrap().to_string(), "1000");
    assert_eq!(JsonNumber::parse("1.2300").unwrap().to_string(), "1.23");

    assert!(parse_json("NaN").is_err());
    assert!(parse_json("Infinity").is_err());
    assert!(parse_json("01").is_err());
}

fn find_pattern<'a>(
    patterns: &'a [json_analyzer::FieldPattern],
    pattern: &str,
) -> &'a json_analyzer::FieldPattern {
    patterns
        .iter()
        .find(|item| item.pattern == pattern)
        .unwrap_or_else(|| panic!("missing pattern {pattern}"))
}

fn value_at<'a>(entries: &'a [json_analyzer::FlattenedEntry<'a>], path: &str) -> &'a JsonValue {
    entries
        .iter()
        .find(|entry| entry.path == path)
        .map(|entry| entry.value)
        .unwrap_or_else(|| panic!("missing path {path}"))
}
