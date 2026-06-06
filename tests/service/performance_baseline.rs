use std::time::{Duration, Instant};

use json_analyzer::*;

#[test]
#[ignore = "opt-in service performance baseline; run with --ignored --nocapture"]
fn performance_baseline_large_generated_json() {
    let service = JsonAnalyzerService::default();
    let input = generated_records_json(5_000);

    let (analysis, analyze_elapsed) = measure(|| {
        service
            .analyze(AnalyzeRequest {
                json_string: input.clone(),
                min_max_deep: true,
                flatten: false,
            })
            .unwrap()
    });
    assert_eq!(analysis.structure.size, 5_000);
    assert_under(
        "large_json.analyze",
        analyze_elapsed,
        Duration::from_secs(15),
    );

    let (fields, discovery_elapsed) = measure(|| {
        service
            .discover_values_fields(ValuesFieldDiscoveryRequest {
                json_string: input.clone(),
                search: Some("department".to_string()),
                limit: Some(20),
                flatten: false,
            })
            .unwrap()
    });
    assert!(
        fields
            .fields
            .iter()
            .any(|field| field.field_path == "[].department")
    );
    assert_under(
        "large_json.discover_values_fields",
        discovery_elapsed,
        Duration::from_secs(10),
    );

    let (values, values_elapsed) = measure(|| {
        service
            .analyze_values(ValuesAnalysisRequest {
                json_string: input.clone(),
                selected_fields: vec!["[].department".to_string(), "[].status".to_string()],
                search: None,
                sort: ValuesSort {
                    by: ValuesSortBy::Count,
                    direction: SortDirection::Desc,
                },
                page: 1,
                page_size: 25,
                include_parent_items: true,
                flatten: false,
            })
            .unwrap()
    });
    assert!(values.total_groups > 1);
    assert_under(
        "large_json.analyze_values",
        values_elapsed,
        Duration::from_secs(10),
    );
}

#[test]
#[ignore = "opt-in service performance baseline; run with --ignored --nocapture"]
fn performance_baseline_duplicate_heavy_generated_json() {
    let service = JsonAnalyzerService::default();
    let input = duplicate_heavy_records_json(8_000);

    let (duplicates, advanced_elapsed) = measure(|| {
        service
            .analyze_advanced_field_duplicates(AdvancedFieldDuplicatesRequest {
                json_string: input.clone(),
                field_path: "[].department".to_string(),
                filter: None,
                case_sensitive: true,
                include_parent_items: true,
                page: 1,
                page_size: 25,
            })
            .unwrap()
    });
    assert!(duplicates.duplicate_group_count > 0);
    assert_under(
        "duplicate_heavy.advanced_field_duplicates",
        advanced_elapsed,
        Duration::from_secs(10),
    );

    let (composite, composite_elapsed) = measure(|| {
        service
            .analyze_composite_duplicates(CompositeDuplicatesRequest {
                json_string: input,
                field_paths: vec!["[].department".to_string(), "[].role".to_string()],
                filter: None,
                case_sensitive: true,
                include_parent_items: false,
                page: 1,
                page_size: 25,
            })
            .unwrap()
    });
    assert!(composite.duplicate_group_count > 0);
    assert_under(
        "duplicate_heavy.composite_duplicates",
        composite_elapsed,
        Duration::from_secs(10),
    );
}

fn measure<T>(operation: impl FnOnce() -> T) -> (T, Duration) {
    let started = Instant::now();
    let output = operation();
    (output, started.elapsed())
}

fn assert_under(label: &str, elapsed: Duration, budget: Duration) {
    eprintln!(
        "{label}: {} ms (budget {} ms)",
        elapsed.as_millis(),
        budget.as_millis()
    );
    assert!(
        elapsed <= budget,
        "{label} exceeded budget: {} ms > {} ms",
        elapsed.as_millis(),
        budget.as_millis()
    );
}

fn generated_records_json(records: usize) -> String {
    let mut output = String::from("[");
    for index in 0..records {
        if index > 0 {
            output.push(',');
        }
        output.push_str(&format!(
            r#"{{"id":{index},"name":"User {index}","department":"{}","role":"{}","status":"{}","score":{},"profile":{{"email":"user{index}@example.com","city":"{}"}},"tags":["tag{}","tier{}"]}}"#,
            department_for(index),
            role_for(index),
            status_for(index),
            index % 100,
            city_for(index),
            index % 13,
            index % 5,
        ));
    }
    output.push(']');
    output
}

fn duplicate_heavy_records_json(records: usize) -> String {
    let mut output = String::from("[");
    for index in 0..records {
        if index > 0 {
            output.push(',');
        }
        output.push_str(&format!(
            r#"{{"id":{index},"department":"{}","role":"{}","status":"{}","bucket":{}}}"#,
            department_for(index % 12),
            role_for(index % 8),
            status_for(index % 3),
            index % 4,
        ));
    }
    output.push(']');
    output
}

fn department_for(index: usize) -> &'static str {
    match index % 5 {
        0 => "Engineering",
        1 => "Design",
        2 => "Support",
        3 => "Operations",
        _ => "Finance",
    }
}

fn role_for(index: usize) -> &'static str {
    match index % 6 {
        0 => "Developer",
        1 => "Designer",
        2 => "Analyst",
        3 => "Manager",
        4 => "Specialist",
        _ => "Coordinator",
    }
}

fn status_for(index: usize) -> &'static str {
    if index % 7 == 0 { "inactive" } else { "active" }
}

fn city_for(index: usize) -> &'static str {
    match index % 4 {
        0 => "Amsterdam",
        1 => "Rotterdam",
        2 => "Utrecht",
        _ => "Haarlem",
    }
}
