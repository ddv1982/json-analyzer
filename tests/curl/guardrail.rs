use json_analyzer::*;
use serde_json::Value;

use crate::support::PARITY_CONTRACTS;

#[test]
fn guardrail_decisions_match_source_derived_contracts_without_network_access() {
    let fixture: Value = serde_json::from_str(PARITY_CONTRACTS).unwrap();
    let outcomes = fixture["curl_executor"]["guardrail_outcomes"]
        .as_array()
        .unwrap();
    let service = JsonAnalyzerService::default();

    for outcome in outcomes {
        let request = &outcome["request"];
        let response = service
            .validate_curl_guardrail(CurlGuardrailRequest {
                method: request["method"].as_str().unwrap().to_string(),
                url: request["url"].as_str().unwrap().to_string(),
                redirect_target: outcome["redirect_target"].as_str().map(str::to_string),
            })
            .unwrap();
        let expected = &outcome["expected_decision"];
        assert_eq!(
            response.decision.allowed,
            expected["allowed"].as_bool().unwrap(),
            "{}",
            outcome["case"].as_str().unwrap()
        );
        assert_eq!(
            response.decision.reason,
            expected["reason"].as_str().unwrap(),
            "{}",
            outcome["case"].as_str().unwrap()
        );
        assert_eq!(
            response.decision.error_type.as_deref(),
            expected["error_type"].as_str(),
            "{}",
            outcome["case"].as_str().unwrap()
        );
    }
}
#[test]
fn guardrail_denies_malformed_hosts_and_special_ip_ranges() {
    let cases = [
        "http://:80",
        "http://user@:80",
        "http://[::ffff:127.0.0.1]/admin",
        "http://100.64.0.1/status",
        "http://224.0.0.1/status",
        "http://[2001:db8::1]/status",
        "http://[ff02::1]/status",
    ];

    for url in cases {
        let decision = evaluate_guardrail(url, false);
        assert!(!decision.allowed, "{url}");
        assert_eq!(
            decision.error_type.as_deref(),
            Some("curl_guardrail_denied")
        );
    }
}
#[test]
fn guardrail_uses_strict_url_parsing_for_preview_decisions() {
    for url in [
        "https://api.example.com:bad/path",
        "https://[::1/path",
        "https://exa mple.com/path",
        "//api.example.com/path",
    ] {
        let decision = evaluate_guardrail(url, false);
        assert!(!decision.allowed, "{url}");
        assert_eq!(decision.reason, "url_is_not_parseable", "{url}");
    }

    let with_userinfo = evaluate_guardrail("https://user:secret@api.example.com/path", false);
    assert!(with_userinfo.allowed);
    assert_eq!(with_userinfo.reason, "public_https_url");

    let localhost_with_trailing_dot = evaluate_guardrail("http://localhost./admin", false);
    assert!(!localhost_with_trailing_dot.allowed);
    assert_eq!(
        localhost_with_trailing_dot.reason,
        "localhost_targets_are_blocked_by_default"
    );
}
#[test]
fn guardrail_validation_and_config_allow_private_networks_are_explicit() {
    let localhost_decision = evaluate_guardrail("http://localhost/admin", false);
    assert!(!localhost_decision.allowed);
    assert_eq!(
        localhost_decision.reason,
        "localhost_targets_are_blocked_by_default"
    );

    let loopback_ip_decision = evaluate_guardrail("http://127.0.0.1/admin", false);
    assert!(!loopback_ip_decision.allowed);
    assert_eq!(
        loopback_ip_decision.reason,
        "private_network_targets_are_blocked_by_default"
    );

    let service = JsonAnalyzerService::new(AppConfig {
        limits: LimitsConfig {
            curl: CurlLimitsConfig {
                allow_private_networks_by_default: true,
                ..CurlLimitsConfig::default()
            },
            ..LimitsConfig::default()
        },
        validation: ValidationConfig::default(),
        features: FeatureFlagsConfig::default(),
    });
    let allowed_private = service
        .validate_curl_guardrail(CurlGuardrailRequest {
            method: "GET".to_string(),
            url: "http://192.168.1.10/status".to_string(),
            redirect_target: None,
        })
        .unwrap();
    assert!(allowed_private.decision.allowed);
    assert_eq!(
        allowed_private.decision.reason,
        "private_network_allowed_by_config"
    );

    let invalid = service
        .validate_curl_guardrail(CurlGuardrailRequest {
            method: "".to_string(),
            url: "https://api.example.com".to_string(),
            redirect_target: None,
        })
        .unwrap_err();
    assert_eq!(invalid.problem.invalid_params[0].name, "method");
}
