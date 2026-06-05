use crate::support::{STRUCTURE_INPUT, assert_close, assert_type_count};
use json_analyzer::{analyze_statistics, analyze_structure, parse_json};

#[test]
fn structure_analysis_matches_source_derived_fixture_shape() {
    let value = parse_json(STRUCTURE_INPUT).unwrap();
    let analysis = analyze_structure(&value);

    assert_eq!(analysis.value_type, "dict");
    assert_eq!(analysis.size, 2);
    assert_eq!(analysis.top_level_size, 2);
    assert_eq!(analysis.total_items, 2);
    assert_eq!(analysis.depth, 4);
    assert_eq!(analysis.field_count, 18);
    assert_eq!(analysis.container_summary.value_type, "dict");
    assert_eq!(
        analysis.field_paths,
        vec![
            "users.0.id",
            "users.0.name",
            "users.0.department",
            "users.0.profile.email",
            "users.0.tags.0",
            "users.0.tags.1",
            "users.1.id",
            "users.1.name",
            "users.1.department",
            "users.1.profile.email",
            "users.1.tags",
            "users.2.id",
            "users.2.name",
            "users.2.department",
            "users.2.profile.email",
            "users.2.tags.0",
            "metadata.total",
            "metadata.source",
        ]
    );
    assert_eq!(analysis.schema.type_name, "object");
    assert!(
        analysis
            .schema
            .properties
            .iter()
            .any(|property| property.name == "users" && property.schema.type_name == "array")
    );
}

#[test]
fn statistics_analysis_matches_source_derived_fixture_counts() {
    let value = parse_json(STRUCTURE_INPUT).unwrap();
    let analysis = analyze_statistics(&value);

    assert_eq!(analysis.total_fields, 18);
    assert_eq!(analysis.null_count, 1);
    assert_eq!(analysis.unique_field_paths, 18);
    assert_type_count(&analysis.type_distribution, "int", 4);
    assert_type_count(&analysis.type_distribution, "str", 12);
    assert_type_count(&analysis.type_distribution, "NoneType", 1);
    assert_type_count(&analysis.type_distribution, "list", 1);

    assert_eq!(analysis.string_length_stats.count, 13);
    assert_eq!(analysis.string_length_stats.min, 2);
    assert_eq!(analysis.string_length_stats.max, 13);
    assert_close(analysis.string_length_stats.avg, 6.538461538461538);

    let empty_tags = analysis
        .field_value_distribution
        .iter()
        .find(|item| item.path == "users.1.tags")
        .expect("empty array terminal distribution");
    assert_eq!(empty_tags.values[0].value, "[]");
}
