mod commands;

use commands::{
    analyze_advanced_field_duplicates, analyze_composite_duplicates, analyze_json, analyze_values,
    analyze_values_explorer, cancel_curl_job, discover_values_fields, execute_curl,
    find_duplicates, format_json, get_config, get_curl_job_results, get_fields, get_health,
    min_max_filled, parse_curl, start_curl_job, validate_curl_guardrail, validate_json,
};
use json_analyzer::{AppConfig, JsonAnalyzerService};

fn main() {
    let mut config = AppConfig::default();
    if let Some(allow_private_networks) = curl_allow_private_networks_from_env() {
        config.limits.curl.allow_private_networks_by_default = allow_private_networks;
    }

    tauri::Builder::default()
        .manage(JsonAnalyzerService::new(config))
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

fn curl_allow_private_networks_from_env() -> Option<bool> {
    std::env::var("JSON_ANALYZER_CURL_ALLOW_PRIVATE_NETWORKS")
        .or_else(|_| std::env::var("CURL_ALLOW_PRIVATE_NETWORKS"))
        .ok()
        .and_then(|value| match value.trim().to_ascii_lowercase().as_str() {
            "1" | "true" | "yes" | "on" => Some(true),
            "0" | "false" | "no" | "off" => Some(false),
            _ => None,
        })
}
