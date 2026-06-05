use crate::support::{MIN_MAX_INPUT, assert_close, assert_record};
use json_analyzer::{analyze_min_max_filled, parse_json};

#[test]
fn min_max_filled_matches_deep_and_shallow_source_derived_fixtures() {
    let value = parse_json(MIN_MAX_INPUT).unwrap();

    let deep = analyze_min_max_filled(&value, true);
    assert_eq!(deep.analysis_path, "root");
    assert_eq!(deep.total_records, 3);
    assert_eq!(deep.min_records.len(), 1);
    assert_eq!(deep.max_records.len(), 1);
    assert_record(&deep.min_records[0], 0, 2, 5, 40.0);
    assert_record(&deep.max_records[0], 1, 7, 7, 100.0);
    assert_eq!(deep.statistics.total_records, 3);
    assert_close(deep.statistics.avg_filled_fields, 14.0 / 3.0);
    assert_close(deep.statistics.median_filled_fields, 5.0);
    assert_close(deep.statistics.std_filled_fields, 2.516611478423583);
    assert_close(deep.statistics.avg_completeness_pct, 74.44444444444444);
    assert_eq!(
        deep.statistics
            .field_count_distribution
            .iter()
            .map(|item| (item.filled_count, item.count))
            .collect::<Vec<_>>(),
        vec![(2, 1), (7, 1), (5, 1)]
    );

    let shallow = analyze_min_max_filled(&value, false);
    assert_eq!(shallow.analysis_path, "root");
    assert_eq!(shallow.total_records, 3);
    assert_record(&shallow.min_records[0], 0, 3, 5, 60.0);
    assert_record(&shallow.max_records[0], 1, 5, 5, 100.0);
    assert_close(shallow.statistics.avg_filled_fields, 4.0);
    assert_close(shallow.statistics.median_filled_fields, 4.0);
    assert_close(shallow.statistics.std_filled_fields, 1.0);
    assert_close(shallow.statistics.avg_completeness_pct, 80.0);
}

#[test]
fn min_max_filled_returns_all_ties_and_reports_no_suitable_records() {
    let tied = parse_json(
        r#"{
          "records": [
            {"id": 1, "name": "A", "email": ""},
            {"id": 2, "name": "B", "email": "b@example.com"},
            {"id": 3, "name": "C", "email": "c@example.com"},
            null,
            "ignored"
          ]
        }"#,
    )
    .unwrap();

    let result = analyze_min_max_filled(&tied, false);
    assert!(result.has_records);
    assert_eq!(result.analysis_path, "records (5 items)");
    assert_eq!(result.total_records, 3);
    assert_eq!(
        result
            .min_records
            .iter()
            .map(|record| record.index)
            .collect::<Vec<_>>(),
        vec![0]
    );
    assert_eq!(
        result
            .max_records
            .iter()
            .map(|record| record.index)
            .collect::<Vec<_>>(),
        vec![1, 2]
    );

    let scalars_only = parse_json(r#"{"data": [1, 2, 3, 4, 5]}"#).unwrap();
    let empty = analyze_min_max_filled(&scalars_only, true);
    assert!(!empty.has_records);
    assert_eq!(empty.analysis_path, "No suitable array found");
    assert_eq!(empty.total_records, 0);
    assert!(empty.min_records.is_empty());
    assert!(empty.max_records.is_empty());
}
