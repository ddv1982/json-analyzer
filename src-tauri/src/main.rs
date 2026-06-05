mod commands;

use commands::{
    analyze_advanced_field_duplicates, analyze_composite_duplicates, analyze_json, analyze_values,
    analyze_values_explorer, cancel_curl_job, discover_values_fields, execute_curl,
    find_duplicates, format_json, get_config, get_curl_job_results, get_fields, get_health,
    min_max_filled, parse_curl, start_curl_job, validate_curl_guardrail, validate_json,
};
use json_analyzer::{AppConfig, JsonAnalyzerService};

fn main() {
    tauri::Builder::default()
        .manage(JsonAnalyzerService::new(AppConfig::default()))
        .invoke_handler(tauri::generate_handler![
            validate_json,
            format_json,
            analyze_json,
            get_fields,
            find_duplicates,
            min_max_filled,
            discover_values_fields,
            analyze_values,
            analyze_values_explorer,
            analyze_advanced_field_duplicates,
            analyze_composite_duplicates,
            parse_curl,
            validate_curl_guardrail,
            execute_curl,
            start_curl_job,
            get_curl_job_results,
            cancel_curl_job,
            get_config,
            get_health
        ])
        .run(tauri::generate_context!())
        .expect("error while running JSON Analyzer Tauri app");
}
