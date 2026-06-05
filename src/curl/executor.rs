use std::io::{self, Read};
use std::net::{IpAddr, SocketAddr, ToSocketAddrs};
use std::sync::mpsc::{self, RecvTimeoutError, SyncSender, TrySendError};
use std::sync::{Arc, Mutex, OnceLock};
use std::thread;
use std::time::{Duration, Instant};

use reqwest::blocking::Client;
use reqwest::redirect::Policy;
use reqwest::{Method, Url};

use crate::curl::guard::is_private_or_special_ip;
use crate::curl::parser::{
    ParsedCurlRequest, RawCurlHeader, parse_curl_request, redact_url_preview,
};
use crate::{
    AppError, CurlExecuteRequest, CurlExecuteResponse, CurlGuardrailDecision, CurlHeader,
    CurlHttpResponse, CurlLimitsConfig, evaluate_guardrail,
};

const MAX_REDIRECTS: usize = 5;
const MAX_DNS_RESOLVER_WORKERS: usize = 32;
const MAX_QUEUED_DNS_RESOLUTIONS: usize = 32;

static DNS_RESOLVER_POOL: OnceLock<Result<DnsResolverPool, String>> = OnceLock::new();

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CurlHttpRequest {
    pub method: String,
    pub url: String,
    pub resolved_addrs: Vec<SocketAddr>,
    pub headers: Vec<RawCurlHeader>,
    pub body: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CurlHttpClientResponse {
    pub status: u16,
    pub status_text: Option<String>,
    pub headers: Vec<RawCurlHeader>,
    pub body: Vec<u8>,
    pub body_truncated: bool,
    pub response_bytes: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CurlHttpClientError {
    Timeout,
    GuardrailDenied(String),
    App(AppError),
    Network(String),
}

pub trait CurlHttpClient: Send + Sync {
    fn send(
        &self,
        request: CurlHttpRequest,
        timeout: Duration,
        max_response_bytes: usize,
    ) -> Result<CurlHttpClientResponse, CurlHttpClientError>;
}

#[derive(Debug, Default, Clone, Copy)]
pub struct ReqwestCurlHttpClient;

impl CurlHttpClient for ReqwestCurlHttpClient {
    fn send(
        &self,
        request: CurlHttpRequest,
        timeout: Duration,
        max_response_bytes: usize,
    ) -> Result<CurlHttpClientResponse, CurlHttpClientError> {
        let method = Method::from_bytes(request.method.as_bytes())
            .map_err(|error| CurlHttpClientError::Network(error.to_string()))?;
        let parsed_url = Url::parse(&request.url)
            .map_err(|error| CurlHttpClientError::Network(error.to_string()))?;
        let mut client_builder = Client::builder()
            .no_proxy()
            .redirect(Policy::none())
            .timeout(timeout)
            .connect_timeout(timeout);
        if let Some(host) = parsed_url.host_str()
            && !is_ip_literal(host)
        {
            if request.resolved_addrs.is_empty() {
                return Err(CurlHttpClientError::GuardrailDenied(
                    "hostname_resolution_returned_no_addresses".to_string(),
                ));
            }
            client_builder = client_builder.resolve_to_addrs(host, &request.resolved_addrs);
        }
        let client = client_builder
            .build()
            .map_err(|error| CurlHttpClientError::Network(error.to_string()))?;
        let mut builder = client.request(method, request.url);
        for header in request.headers {
            builder = builder.header(header.name, header.value);
        }
        if let Some(body) = request.body {
            builder = builder.body(body);
        }

        let response = builder.send().map_err(|error| {
            if error.is_timeout() {
                CurlHttpClientError::Timeout
            } else {
                CurlHttpClientError::Network(error.to_string())
            }
        })?;

        let status = response.status();
        let status_text = status.canonical_reason().map(str::to_string);
        let headers = response
            .headers()
            .iter()
            .map(|(name, value)| RawCurlHeader {
                name: name.as_str().to_string(),
                value: value.to_str().unwrap_or("<non-utf8>").to_string(),
            })
            .collect::<Vec<_>>();
        let content_length = response.content_length().map(|value| value as usize);
        let mut reader = response.take(response_read_limit(max_response_bytes));
        let mut body = Vec::new();
        reader
            .read_to_end(&mut body)
            .map_err(|error| CurlHttpClientError::Network(error.to_string()))?;
        let body_truncated = body.len() > max_response_bytes;
        if body_truncated {
            body.truncate(max_response_bytes);
        }
        let response_bytes = content_length.unwrap_or(body.len());

        Ok(CurlHttpClientResponse {
            status: status.as_u16(),
            status_text,
            headers,
            body,
            body_truncated,
            response_bytes,
        })
    }
}

pub fn execute_curl_request(
    request: CurlExecuteRequest,
    limits: &CurlLimitsConfig,
) -> Result<CurlExecuteResponse, AppError> {
    execute_curl_request_with_client(request, limits, &ReqwestCurlHttpClient)
}

pub fn execute_curl_request_with_client(
    request: CurlExecuteRequest,
    limits: &CurlLimitsConfig,
    client: &dyn CurlHttpClient,
) -> Result<CurlExecuteResponse, AppError> {
    if !limits.enabled {
        return Err(AppError::unsupported_config(
            "limits.curl.enabled",
            "curl execution is disabled by configuration",
        ));
    }

    let parsed = parse_curl_request(&request.curl)?;
    let timeout_ms = normalize_timeout_ms(request.timeout_ms, limits)?;
    let timeout = Duration::from_millis(timeout_ms);
    let started = Instant::now();
    let guarded_destination = guard_url_before_dispatch(
        &parsed.raw_url,
        limits.allow_private_networks_by_default,
        timeout,
    )?;

    let http_response = execute_with_redirects(
        &parsed,
        guarded_destination.resolved_addrs.clone(),
        request.follow_redirects,
        limits.allow_private_networks_by_default,
        started + timeout,
        limits.max_response_bytes,
        client,
    )
    .map_err(|error| map_client_error(error, timeout_ms, &parsed.preview.url))?;

    Ok(CurlExecuteResponse {
        request_preview: parsed.preview,
        guardrail: guarded_destination.decision,
        response: Some(to_dto_response(http_response, started.elapsed())),
    })
}

pub(crate) fn normalize_timeout_ms(
    requested_timeout_ms: Option<u64>,
    limits: &CurlLimitsConfig,
) -> Result<u64, AppError> {
    let timeout_ms = requested_timeout_ms.unwrap_or(limits.default_timeout_ms);
    if timeout_ms == 0 {
        return Err(AppError::invalid_request(
            "timeout_ms",
            "curl timeout must be greater than or equal to 1 ms",
        ));
    }
    if timeout_ms > limits.max_timeout_ms {
        return Err(AppError::invalid_request(
            "timeout_ms",
            format!("curl timeout cannot exceed {} ms", limits.max_timeout_ms),
        ));
    }
    Ok(timeout_ms)
}

fn response_read_limit(max_response_bytes: usize) -> u64 {
    u64::try_from(max_response_bytes)
        .unwrap_or(u64::MAX)
        .saturating_add(1)
}

fn execute_with_redirects(
    parsed: &ParsedCurlRequest,
    initial_resolved_addrs: Vec<SocketAddr>,
    follow_redirects: bool,
    allow_private_networks: bool,
    deadline: Instant,
    max_response_bytes: usize,
    client: &dyn CurlHttpClient,
) -> Result<CurlHttpClientResponse, CurlHttpClientError> {
    let mut current_url = parsed.raw_url.clone();
    let mut current_resolved_addrs = initial_resolved_addrs;
    let mut current_headers = parsed.raw_headers.clone();
    let mut current_body = parsed.raw_body.clone();
    let mut current_method = parsed.preview.method.clone();

    for redirect_count in 0..=MAX_REDIRECTS {
        let timeout = remaining_timeout(deadline)?;
        let response = client.send(
            CurlHttpRequest {
                method: current_method.clone(),
                url: current_url.clone(),
                resolved_addrs: current_resolved_addrs.clone(),
                headers: current_headers.clone(),
                body: current_body.clone(),
            },
            timeout,
            max_response_bytes,
        )?;

        if !follow_redirects || !is_redirect_status(response.status) {
            return Ok(response);
        }

        let Some(location) = response
            .headers
            .iter()
            .find(|header| header.name.eq_ignore_ascii_case("location"))
            .map(|header| header.value.as_str())
        else {
            return Ok(response);
        };

        if redirect_count == MAX_REDIRECTS {
            return Err(CurlHttpClientError::Network(format!(
                "curl redirect limit of {MAX_REDIRECTS} exceeded"
            )));
        }

        let next_url = resolve_redirect_url(&current_url, location)?;
        let next_destination = guard_url_before_dispatch(
            &next_url,
            allow_private_networks,
            remaining_timeout(deadline)?,
        )
        .map_err(CurlHttpClientError::App)?;

        if !same_origin(&current_url, &next_url) {
            current_headers.retain(|header| !is_sensitive_header(&header.name));
        }
        if response.status == 303 && current_method != "HEAD" {
            current_method = "GET".to_string();
            current_body = None;
        }
        current_url = next_url;
        current_resolved_addrs = next_destination.resolved_addrs;
    }

    unreachable!("redirect loop returns from inside bounded for loop")
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct GuardedDestination {
    decision: CurlGuardrailDecision,
    resolved_addrs: Vec<SocketAddr>,
}

fn guard_url_before_dispatch(
    url: &str,
    allow_private_networks: bool,
    timeout: Duration,
) -> Result<GuardedDestination, AppError> {
    let decision = evaluate_guardrail(url, allow_private_networks);
    if !decision.allowed {
        return Err(AppError::curl_guardrail_denied("url", decision.reason));
    }

    Ok(GuardedDestination {
        decision,
        resolved_addrs: validate_resolved_destination(url, allow_private_networks, timeout)?,
    })
}

fn validate_resolved_destination(
    url: &str,
    allow_private_networks: bool,
    timeout: Duration,
) -> Result<Vec<SocketAddr>, AppError> {
    let parsed = Url::parse(url)
        .map_err(|_error| AppError::curl_guardrail_denied("url", "url_is_not_parseable"))?;
    let Some(host) = parsed.host_str() else {
        return Err(AppError::curl_guardrail_denied(
            "url",
            "url_host_is_required",
        ));
    };

    if is_ip_literal(host) {
        return Ok(Vec::new());
    }

    let port = parsed
        .port_or_known_default()
        .ok_or_else(|| AppError::curl_guardrail_denied("url", "url_port_is_required"))?;
    let addresses = resolve_host_with_timeout(host.to_string(), port, timeout)?;
    if addresses.is_empty() {
        return Err(AppError::curl_guardrail_denied(
            "url",
            "hostname_resolution_returned_no_addresses",
        ));
    }
    for address in &addresses {
        if is_private_or_special_ip(address.ip()) && !allow_private_networks {
            return Err(AppError::curl_guardrail_denied(
                "url",
                "resolved_private_network_target_blocked_by_default",
            ));
        }
    }

    Ok(addresses)
}

fn remaining_timeout(deadline: Instant) -> Result<Duration, CurlHttpClientError> {
    let remaining = deadline.saturating_duration_since(Instant::now());
    if remaining.is_zero() {
        Err(CurlHttpClientError::Timeout)
    } else {
        Ok(remaining)
    }
}

fn resolve_host_with_timeout(
    host: String,
    port: u16,
    timeout: Duration,
) -> Result<Vec<SocketAddr>, AppError> {
    let (sender, receiver) = mpsc::channel();
    let job = DnsResolveJob { host, port, sender };
    let pool = dns_resolver_pool()?;
    pool.sender.try_send(job).map_err(|error| match error {
        TrySendError::Full(_job) => {
            AppError::curl_network_error("too many queued curl DNS resolutions; try again shortly")
        }
        TrySendError::Disconnected(_job) => {
            AppError::curl_network_error("curl DNS resolver pool stopped unexpectedly")
        }
    })?;

    match receiver.recv_timeout(timeout) {
        Ok(Ok(addresses)) => Ok(addresses),
        Ok(Err(error)) => Err(AppError::curl_network_error(format!(
            "failed to resolve curl host: {error}"
        ))),
        Err(RecvTimeoutError::Timeout) => Err(AppError::curl_timeout(timeout.as_millis() as u64)),
        Err(RecvTimeoutError::Disconnected) => Err(AppError::curl_network_error(
            "failed to resolve curl host: resolver worker stopped unexpectedly",
        )),
    }
}

struct DnsResolverPool {
    sender: SyncSender<DnsResolveJob>,
}

struct DnsResolveJob {
    host: String,
    port: u16,
    sender: mpsc::Sender<io::Result<Vec<SocketAddr>>>,
}

fn dns_resolver_pool() -> Result<&'static DnsResolverPool, AppError> {
    match DNS_RESOLVER_POOL.get_or_init(start_dns_resolver_pool) {
        Ok(pool) => Ok(pool),
        Err(error) => Err(AppError::curl_network_error(error.clone())),
    }
}

fn start_dns_resolver_pool() -> Result<DnsResolverPool, String> {
    let (sender, receiver) = mpsc::sync_channel::<DnsResolveJob>(MAX_QUEUED_DNS_RESOLUTIONS);
    let receiver = Arc::new(Mutex::new(receiver));

    for worker_index in 0..MAX_DNS_RESOLVER_WORKERS {
        let receiver = receiver.clone();
        thread::Builder::new()
            .name(format!("curl-dns-guardrail-{worker_index}"))
            .spawn(move || {
                loop {
                    let job = match receiver.lock() {
                        Ok(receiver) => receiver.recv(),
                        Err(_poisoned) => return,
                    };
                    let Ok(job) = job else {
                        return;
                    };
                    let result = (job.host.as_str(), job.port)
                        .to_socket_addrs()
                        .map(|addresses| addresses.collect::<Vec<_>>());
                    let _ = job.sender.send(result);
                }
            })
            .map_err(|error| format!("failed to start curl DNS resolver worker: {error}"))?;
    }

    Ok(DnsResolverPool { sender })
}

fn is_ip_literal(host: &str) -> bool {
    host.parse::<IpAddr>().is_ok()
}

fn resolve_redirect_url(current_url: &str, location: &str) -> Result<String, CurlHttpClientError> {
    let base =
        Url::parse(current_url).map_err(|error| CurlHttpClientError::Network(error.to_string()))?;
    base.join(location)
        .map(|url| url.to_string())
        .map_err(|error| CurlHttpClientError::Network(error.to_string()))
}

fn same_origin(left: &str, right: &str) -> bool {
    let Ok(left) = Url::parse(left) else {
        return false;
    };
    let Ok(right) = Url::parse(right) else {
        return false;
    };

    left.scheme() == right.scheme()
        && left.host_str() == right.host_str()
        && left.port_or_known_default() == right.port_or_known_default()
}

fn is_redirect_status(status: u16) -> bool {
    matches!(status, 301 | 302 | 303 | 307 | 308)
}

fn to_dto_response(response: CurlHttpClientResponse, elapsed: Duration) -> CurlHttpResponse {
    CurlHttpResponse {
        status: response.status,
        status_text: response.status_text,
        headers: response
            .headers
            .into_iter()
            .map(|header| {
                let redacted = is_sensitive_header(&header.name);
                CurlHeader {
                    name: header.name,
                    value: if redacted {
                        "***".to_string()
                    } else {
                        header.value
                    },
                    redacted,
                }
            })
            .collect(),
        body: String::from_utf8_lossy(&response.body).to_string(),
        body_truncated: response.body_truncated,
        elapsed_ms: elapsed.as_millis().try_into().unwrap_or(u64::MAX),
        response_bytes: response.response_bytes,
    }
}

fn is_sensitive_header(name: &str) -> bool {
    matches!(
        name.to_ascii_lowercase().as_str(),
        "authorization"
            | "proxy-authorization"
            | "cookie"
            | "set-cookie"
            | "api-key"
            | "apikey"
            | "x-api-key"
            | "x-auth-token"
            | "x-access-token"
            | "private-token"
            | "x-csrf-token"
            | "x-xsrf-token"
    )
}

fn map_client_error(
    error: CurlHttpClientError,
    timeout_ms: u64,
    redacted_request_url: &str,
) -> AppError {
    match error {
        CurlHttpClientError::Timeout => AppError::curl_timeout(timeout_ms),
        CurlHttpClientError::GuardrailDenied(detail) => {
            AppError::curl_guardrail_denied("url", detail)
        }
        CurlHttpClientError::App(error) => error,
        CurlHttpClientError::Network(detail) => AppError::curl_network_error(format!(
            "Curl network error while requesting {redacted_request_url}: {}",
            sanitize_network_error_detail(&detail)
        )),
    }
}

fn sanitize_network_error_detail(detail: &str) -> String {
    let mut sanitized = String::with_capacity(detail.len());
    let mut remaining = detail;

    while let Some(scheme_index) = find_url_scheme(remaining) {
        sanitized.push_str(&remaining[..scheme_index]);
        let url_and_after = &remaining[scheme_index..];
        let url_end = url_and_after
            .find(|ch: char| ch.is_whitespace() || matches!(ch, '\'' | '"' | '<' | '>'))
            .unwrap_or(url_and_after.len());
        let (candidate, after_candidate) = url_and_after.split_at(url_end);
        sanitized.push_str(&redact_url_token(candidate));
        remaining = after_candidate;
    }

    sanitized.push_str(remaining);
    sanitized
}

fn find_url_scheme(value: &str) -> Option<usize> {
    match (value.find("http://"), value.find("https://")) {
        (Some(http), Some(https)) => Some(http.min(https)),
        (Some(http), None) => Some(http),
        (None, Some(https)) => Some(https),
        (None, None) => None,
    }
}

fn redact_url_token(candidate: &str) -> String {
    let url_end = candidate
        .trim_end_matches([')', ']', '}', ',', ';', '.', ':'])
        .len();
    let (url, suffix) = candidate.split_at(url_end);
    format!("{}{}", redact_url_preview(url), suffix)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn response_read_limit_saturates_for_extreme_preview_limits() {
        assert_eq!(response_read_limit(0), 1);
        assert_eq!(response_read_limit(1024), 1025);
        assert_eq!(response_read_limit(usize::MAX), u64::MAX);
    }
}
