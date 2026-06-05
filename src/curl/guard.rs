use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};

use reqwest::Url;

use crate::CurlGuardrailDecision;

pub fn evaluate_guardrail(url: &str, allow_private_networks: bool) -> CurlGuardrailDecision {
    evaluate_guardrail_with_redirect(url, None, allow_private_networks)
}

pub fn evaluate_guardrail_with_redirect(
    url: &str,
    redirect_target: Option<&str>,
    allow_private_networks: bool,
) -> CurlGuardrailDecision {
    let initial = evaluate_single_url(url, allow_private_networks);
    if !initial.allowed {
        return initial;
    }

    if let Some(redirect_target) = redirect_target {
        let redirect = evaluate_single_url(redirect_target, allow_private_networks);
        if !redirect.allowed {
            return CurlGuardrailDecision {
                allowed: false,
                reason: "redirect_target_blocked".to_string(),
                error_type: Some("curl_guardrail_denied".to_string()),
            };
        }
    }

    initial
}

fn evaluate_single_url(url: &str, allow_private_networks: bool) -> CurlGuardrailDecision {
    let Ok(parsed) = Url::parse(url.trim()) else {
        return denied("url_is_not_parseable");
    };

    match parsed.scheme() {
        "http" | "https" => {}
        _ => return denied("only_http_and_https_schemes_are_supported"),
    }

    let Some(host) = parsed.host_str() else {
        return denied("url_host_is_required");
    };
    let host = normalize_host(host);

    if is_localhost_host(&host) {
        if allow_private_networks {
            return allowed("private_network_allowed_by_config");
        }
        return denied("localhost_targets_are_blocked_by_default");
    }

    if let Ok(ip) = parse_ip_host(&host)
        && is_private_or_special_ip(ip)
    {
        if allow_private_networks {
            return allowed("private_network_allowed_by_config");
        }
        return denied("private_network_targets_are_blocked_by_default");
    }

    if parsed.scheme() == "https" {
        allowed("public_https_url")
    } else {
        allowed("public_http_url")
    }
}

fn normalize_host(host: &str) -> String {
    host.trim_end_matches('.')
        .trim_start_matches('[')
        .trim_end_matches(']')
        .to_ascii_lowercase()
}

fn is_localhost_host(host: &str) -> bool {
    host == "localhost" || host.ends_with(".localhost")
}

fn parse_ip_host(host: &str) -> Result<IpAddr, std::net::AddrParseError> {
    host.parse::<IpAddr>()
}

pub(crate) fn is_private_or_special_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(ip) => is_private_or_special_ipv4(ip),
        IpAddr::V6(ip) => is_private_or_special_ipv6(ip),
    }
}

fn is_private_or_special_ipv4(ip: Ipv4Addr) -> bool {
    ip.is_private()
        || ip.is_loopback()
        || ip.is_link_local()
        || ip.is_broadcast()
        || ip.is_documentation()
        || ip.is_multicast()
        || is_shared_address_ipv4(ip)
        || is_reserved_ipv4(ip)
        || ip.octets()[0] == 0
}

fn is_private_or_special_ipv6(ip: Ipv6Addr) -> bool {
    if let Some(mapped_ipv4) = ip.to_ipv4_mapped() {
        return is_private_or_special_ipv4(mapped_ipv4);
    }

    ip.is_loopback()
        || ip.is_unspecified()
        || ip.is_multicast()
        || is_unique_local_ipv6(ip)
        || is_unicast_link_local_ipv6(ip)
        || is_documentation_ipv6(ip)
}

fn is_shared_address_ipv4(ip: Ipv4Addr) -> bool {
    let octets = ip.octets();
    octets[0] == 100 && (octets[1] & 0b1100_0000) == 0b0100_0000
}

fn is_reserved_ipv4(ip: Ipv4Addr) -> bool {
    ip.octets()[0] >= 240
}

fn is_unique_local_ipv6(ip: Ipv6Addr) -> bool {
    (ip.segments()[0] & 0xfe00) == 0xfc00
}

fn is_unicast_link_local_ipv6(ip: Ipv6Addr) -> bool {
    (ip.segments()[0] & 0xffc0) == 0xfe80
}

fn is_documentation_ipv6(ip: Ipv6Addr) -> bool {
    ip.segments()[0] == 0x2001 && ip.segments()[1] == 0x0db8
}

fn allowed(reason: &str) -> CurlGuardrailDecision {
    CurlGuardrailDecision {
        allowed: true,
        reason: reason.to_string(),
        error_type: None,
    }
}

fn denied(reason: &str) -> CurlGuardrailDecision {
    CurlGuardrailDecision {
        allowed: false,
        reason: reason.to_string(),
        error_type: Some("curl_guardrail_denied".to_string()),
    }
}
