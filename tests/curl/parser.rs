use json_analyzer::*;
use serde_json::Value;

use crate::support::PARITY_CONTRACTS;

#[test]
fn parses_source_derived_curl_examples_without_executing_network() {
    let fixture: Value = serde_json::from_str(PARITY_CONTRACTS).unwrap();
    let examples = fixture["curl_executor"]["parser_examples"]
        .as_array()
        .unwrap();
    let service = JsonAnalyzerService::default();

    let get = examples
        .iter()
        .find(|example| example["case"] == "get_with_accept_header")
        .unwrap();
    let parsed_get = service
        .parse_curl(CurlParseRequest {
            curl: get["curl"].as_str().unwrap().to_string(),
        })
        .unwrap()
        .parsed;
    let expected_get = &get["expected_parse"];
    assert_eq!(parsed_get.method, expected_get["method"].as_str().unwrap());
    assert_eq!(parsed_get.url, expected_get["url"].as_str().unwrap());
    assert_eq!(parsed_get.body, None);
    assert_eq!(parsed_get.auth.bearer_token_present, false);
    assert_eq!(parsed_get.supported_options, Vec::<String>::new());
    assert_eq!(parsed_get.warnings, Vec::<String>::new());
    assert_eq!(parsed_get.headers.len(), 1);
    assert_eq!(parsed_get.headers[0].name, "Accept");
    assert_eq!(parsed_get.headers[0].value, "application/json");
    assert!(!parsed_get.headers[0].redacted);

    let post = examples
        .iter()
        .find(|example| example["case"] == "post_json_with_bearer")
        .unwrap();
    let parsed_post = service
        .parse_curl(CurlParseRequest {
            curl: post["curl"].as_str().unwrap().to_string(),
        })
        .unwrap()
        .parsed;
    let expected_post = &post["expected_parse"];
    assert_eq!(
        parsed_post.method,
        expected_post["method"].as_str().unwrap()
    );
    assert_eq!(parsed_post.url, expected_post["url"].as_str().unwrap());
    assert_eq!(parsed_post.body.as_deref(), Some(r#"{"name":"Alice"}"#));
    assert_eq!(parsed_post.body_kind, Some(CurlBodyKind::JsonString));
    assert_eq!(parsed_post.headers.len(), 2);
    assert_eq!(parsed_post.headers[0].name, "Authorization");
    assert_eq!(parsed_post.headers[0].value, "Bearer ***");
    assert!(parsed_post.headers[0].redacted);
    assert_eq!(parsed_post.headers[1].name, "Content-Type");
    assert_eq!(parsed_post.headers[1].value, "application/json");
    assert!(parsed_post.auth.bearer_token_present);
    assert_eq!(parsed_post.auth.scheme.as_deref(), Some("Bearer"));
    assert_eq!(
        parsed_post.supported_options,
        vec!["-X".to_string(), "-H".to_string(), "--data".to_string()]
    );
    assert_eq!(parsed_post.warnings, Vec::<String>::new());

    let unsupported = examples
        .iter()
        .find(|example| example["case"] == "unsupported_file_upload")
        .unwrap();
    let error = service
        .parse_curl(CurlParseRequest {
            curl: unsupported["curl"].as_str().unwrap().to_string(),
        })
        .unwrap_err();
    let expected_problem = &unsupported["expected_problem"];
    assert_eq!(
        error.problem.error_type,
        expected_problem["error_type"].as_str().unwrap()
    );
    assert_eq!(error.problem.status, Some(400));
    assert_eq!(error.problem.invalid_params[0].name, "curl");
    assert_eq!(
        error.problem.invalid_params[0].reason,
        "unsupported file upload option -F"
    );
}
#[test]
fn curl_parser_handles_common_supported_options_with_safe_previews() {
    let parsed = parse_curl(
        "curl --request put --url 'https://api.example.com/users/1' \
         --user 'alice:secret' --cookie 'session=secret' \
         --header 'X-Auth-Token: secret-token' --header 'Api-Key: secret-key' \
         --user-agent 'Json Analyzer Test' --data-raw 'name=Alice&role=Admin'",
    )
    .unwrap();

    assert_eq!(parsed.method, "PUT");
    assert_eq!(parsed.url, "https://api.example.com/users/1");
    assert_eq!(parsed.body.as_deref(), Some("name=Alice&role=Admin"));
    assert_eq!(parsed.body_kind, Some(CurlBodyKind::FormString));
    assert_eq!(
        parsed
            .headers
            .iter()
            .map(|header| header.name.as_str())
            .collect::<Vec<_>>(),
        vec![
            "Authorization",
            "Cookie",
            "X-Auth-Token",
            "Api-Key",
            "User-Agent"
        ]
    );
    assert_eq!(parsed.headers[0].value, "Basic ***");
    assert_eq!(parsed.headers[1].value, "***");
    assert_eq!(parsed.headers[2].value, "***");
    assert!(parsed.headers[2].redacted);
    assert_eq!(parsed.headers[3].value, "***");
    assert!(parsed.headers[3].redacted);
    assert_eq!(parsed.auth.scheme.as_deref(), Some("Basic"));
    assert!(!parsed.auth.bearer_token_present);
    assert!(parsed.supported_options.contains(&"-X".to_string()));
    assert!(parsed.supported_options.contains(&"--url".to_string()));
    assert!(parsed.supported_options.contains(&"-u".to_string()));
    assert!(parsed.supported_options.contains(&"-b".to_string()));
    assert!(parsed.supported_options.contains(&"-A".to_string()));
    assert!(parsed.supported_options.contains(&"--data-raw".to_string()));
}
#[test]
fn curl_parser_get_mode_moves_data_to_query_string() {
    let parsed =
        parse_curl("curl -G -d 'q=alice' --data 'limit=2' https://api.example.com/search").unwrap();

    assert_eq!(parsed.method, "GET");
    assert_eq!(parsed.url, "https://api.example.com/search?q=alice&limit=2");
    assert_eq!(parsed.body, None);
    assert_eq!(parsed.body_kind, None);
}
#[test]
fn curl_parser_redacts_url_secrets_in_preview_only() {
    let parsed = parse_curl_request(
        "curl 'https://user:password@api.example.com/search?api_key=secret&q=alice&token=abc'",
    )
    .unwrap();

    assert_eq!(
        parsed.preview.url,
        "https://api.example.com/search?api_key=***&q=alice&token=***"
    );
    assert_eq!(
        parsed.raw_url,
        "https://user:password@api.example.com/search?api_key=secret&q=alice&token=abc"
    );
}
#[test]
fn curl_parser_preserves_empty_quoted_values() {
    let parsed = parse_curl("curl -X POST -d '' https://api.example.com/empty").unwrap();

    assert_eq!(parsed.method, "POST");
    assert_eq!(parsed.url, "https://api.example.com/empty");
    assert_eq!(parsed.body.as_deref(), Some(""));
    assert_eq!(parsed.body_kind, Some(CurlBodyKind::RawString));
}
#[test]
fn curl_parser_rejects_invalid_inputs_before_any_execution_boundary() {
    let cases = [
        ("", "curl"),
        ("wget https://api.example.com", "curl"),
        ("curl", "url"),
        ("curl https://one.example https://two.example", "url"),
        (
            "curl -H 'Accept application/json' https://api.example.com",
            "curl",
        ),
        ("curl -X 'POST!' https://api.example.com", "curl"),
        ("curl --unknown https://api.example.com", "curl"),
        ("curl -d @secret.json https://api.example.com", "curl"),
        (
            "curl --data-urlencode name@secret.txt https://api.example.com",
            "curl",
        ),
        (
            "curl -H 'Accept: application/json https://api.example.com",
            "curl",
        ),
    ];

    for (command, invalid_param) in cases {
        let error = parse_curl(command).unwrap_err();
        assert_eq!(error.problem.status, Some(400), "{command}");
        assert_eq!(
            error.problem.invalid_params[0].name, invalid_param,
            "{command}"
        );
    }
}
#[test]
fn curl_parse_redacts_malformed_preview_urls_best_effort() {
    let service = JsonAnalyzerService::default();
    let parsed = service
        .parse_curl(CurlParseRequest {
            curl: "curl 'https://user:pass@example .com/path?api_key=secret&visible=ok&token=abc#frag'"
                .to_string(),
        })
        .unwrap();

    assert!(!parsed.parsed.url.contains("user:pass"));
    assert!(!parsed.parsed.url.contains("secret"));
    assert!(!parsed.parsed.url.contains("token=abc"));
    assert!(parsed.parsed.url.contains("api_key=***"));
    assert!(parsed.parsed.url.contains("token=***"));
    assert!(parsed.parsed.url.contains("visible=ok"));
}
