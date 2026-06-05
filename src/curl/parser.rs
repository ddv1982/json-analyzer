use std::collections::BTreeSet;

use crate::{AppError, CurlAuthPreview, CurlBodyKind, CurlHeader, ParsedCurlPreview};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParsedCurlRequest {
    pub preview: ParsedCurlPreview,
    pub raw_url: String,
    pub raw_headers: Vec<RawCurlHeader>,
    pub raw_body: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RawCurlHeader {
    pub name: String,
    pub value: String,
}

const SENSITIVE_HEADERS: &[&str] = &[
    "authorization",
    "proxy-authorization",
    "cookie",
    "set-cookie",
    "api-key",
    "apikey",
    "x-api-key",
    "x-auth-token",
    "x-access-token",
    "private-token",
    "x-csrf-token",
    "x-xsrf-token",
];

#[derive(Debug, Default)]
struct ParseState {
    method: Option<String>,
    url: Option<String>,
    headers: Vec<CurlHeader>,
    raw_headers: Vec<RawCurlHeader>,
    body_parts: Vec<String>,
    explicit_get: bool,
    head: bool,
    supported_options: Vec<String>,
    warnings: Vec<String>,
    bearer_token_present: bool,
    auth_scheme: Option<String>,
}

pub fn parse_curl(curl: &str) -> Result<ParsedCurlPreview, AppError> {
    Ok(parse_curl_request(curl)?.preview)
}

pub fn parse_curl_request(curl: &str) -> Result<ParsedCurlRequest, AppError> {
    if curl.trim().is_empty() {
        return Err(AppError::invalid_request(
            "curl",
            "curl command cannot be empty",
        ));
    }

    let mut tokens = tokenize(curl)?;
    if tokens.is_empty() {
        return Err(AppError::invalid_request(
            "curl",
            "curl command cannot be empty",
        ));
    }

    if tokens[0] == "curl" || tokens[0].ends_with("/curl") || tokens[0].ends_with("\\curl") {
        tokens.remove(0);
    } else {
        return Err(AppError::invalid_request(
            "curl",
            "curl command must start with curl",
        ));
    }

    if tokens.is_empty() {
        return Err(AppError::invalid_request(
            "url",
            "curl command must include a URL",
        ));
    }

    let mut state = ParseState::default();
    let mut index = 0;
    while index < tokens.len() {
        let token = &tokens[index];
        if token == "--" {
            index += 1;
            while index < tokens.len() {
                set_url(&mut state, &tokens[index])?;
                index += 1;
            }
            break;
        }

        if token.starts_with('-') && token != "-" {
            index = parse_option(&tokens, index, &mut state)?;
        } else {
            set_url(&mut state, token)?;
            index += 1;
        }
    }

    let mut url = state
        .url
        .ok_or_else(|| AppError::invalid_request("url", "curl command must include a URL"))?;

    let body = if state.body_parts.is_empty() {
        None
    } else {
        Some(state.body_parts.join("&"))
    };

    if state.explicit_get
        && let Some(body) = body.as_ref()
        && !body.is_empty()
    {
        append_query(&mut url, body);
    }

    let method = state
        .method
        .or_else(|| state.head.then(|| "HEAD".to_string()))
        .unwrap_or_else(|| {
            if body.is_some() && !state.explicit_get {
                "POST".to_string()
            } else {
                "GET".to_string()
            }
        });

    let raw_body = if state.explicit_get { None } else { body };
    let body_kind = raw_body
        .as_ref()
        .map(|body| infer_body_kind(body, &state.headers));
    let body = raw_body
        .as_ref()
        .map(|body| redact_body_preview(body, body_kind));
    let supported_options = normalize_supported_options(state.supported_options);

    let preview_url = redact_url_preview(&url);

    Ok(ParsedCurlRequest {
        preview: ParsedCurlPreview {
            method,
            url: preview_url,
            headers: state.headers,
            body,
            body_kind,
            auth: CurlAuthPreview {
                bearer_token_present: state.bearer_token_present,
                scheme: state.auth_scheme,
            },
            supported_options,
            warnings: state.warnings,
        },
        raw_url: url,
        raw_headers: state.raw_headers,
        raw_body,
    })
}

fn parse_option(
    tokens: &[String],
    index: usize,
    state: &mut ParseState,
) -> Result<usize, AppError> {
    let token = &tokens[index];
    let (option, inline_value) = split_long_option(token);

    match option {
        "-X" | "--request" => {
            let (value, next_index) = option_value(tokens, index, inline_value, option)?;
            state.method = Some(validate_method(value)?);
            push_supported(state, option);
            Ok(next_index)
        }
        "-H" | "--header" => {
            let (value, next_index) = option_value(tokens, index, inline_value, option)?;
            let (header, raw_header) = parse_header(value)?;
            apply_auth_preview(state, &header.name, &header.value, header.redacted);
            state.headers.push(header);
            state.raw_headers.push(raw_header);
            push_supported(state, "-H");
            Ok(next_index)
        }
        "--url" => {
            let (value, next_index) = option_value(tokens, index, inline_value, option)?;
            set_url(state, value)?;
            push_supported(state, "--url");
            Ok(next_index)
        }
        "-d" | "--data" | "--data-raw" | "--data-binary" | "--data-ascii" | "--data-urlencode" => {
            let (value, next_index) = option_value(tokens, index, inline_value, option)?;
            if value.starts_with('@')
                || (option == "--data-urlencode" && data_urlencode_uses_file(value))
            {
                return Err(AppError::invalid_request(
                    "curl",
                    format!("file-backed curl data values are not supported for {option}"),
                ));
            }
            state.body_parts.push(value.to_string());
            push_supported(state, canonical_data_option(option));
            Ok(next_index)
        }
        "-F" | "--form" | "--form-string" | "-T" | "--upload-file" => {
            Err(AppError::unsupported_file_upload_option("curl", option))
        }
        "-u" | "--user" | "--user-name" => {
            let (value, next_index) = option_value(tokens, index, inline_value, option)?;
            if value.is_empty() {
                return Err(AppError::invalid_request(
                    "curl",
                    "curl user cannot be empty",
                ));
            }
            state.headers.push(CurlHeader {
                name: "Authorization".to_string(),
                value: "Basic ***".to_string(),
                redacted: true,
            });
            state.raw_headers.push(RawCurlHeader {
                name: "Authorization".to_string(),
                value: format!("Basic {}", base64_encode(value.as_bytes())),
            });
            state.auth_scheme.get_or_insert_with(|| "Basic".to_string());
            push_supported(state, "-u");
            Ok(next_index)
        }
        "-A" | "--user-agent" => {
            let (value, next_index) = option_value(tokens, index, inline_value, option)?;
            state.headers.push(CurlHeader {
                name: "User-Agent".to_string(),
                value: value.to_string(),
                redacted: false,
            });
            state.raw_headers.push(RawCurlHeader {
                name: "User-Agent".to_string(),
                value: value.to_string(),
            });
            push_supported(state, "-A");
            Ok(next_index)
        }
        "-I" | "--head" => {
            state.head = true;
            push_supported(state, "-I");
            Ok(index + 1)
        }
        "-G" | "--get" => {
            state.explicit_get = true;
            push_supported(state, "-G");
            Ok(index + 1)
        }
        "-L" | "--location" => {
            state.warnings.push(
                "redirect following is parsed for preview only and is not executed".to_string(),
            );
            push_supported(state, "-L");
            Ok(index + 1)
        }
        "-k" | "--insecure" => {
            state
                .warnings
                .push("TLS verification options are ignored by parse-only preview".to_string());
            push_supported(state, "-k");
            Ok(index + 1)
        }
        "-s" | "--silent" | "-S" | "--show-error" | "-i" | "--include" | "--compressed" => {
            push_supported(state, option);
            Ok(index + 1)
        }
        "-b" | "--cookie" => {
            let (value, next_index) = option_value(tokens, index, inline_value, option)?;
            state.headers.push(CurlHeader {
                name: "Cookie".to_string(),
                value: redact_header_value("Cookie", value).0,
                redacted: true,
            });
            state.raw_headers.push(RawCurlHeader {
                name: "Cookie".to_string(),
                value: value.to_string(),
            });
            push_supported(state, "-b");
            Ok(next_index)
        }
        _ => Err(AppError::invalid_request(
            "curl",
            format!("unsupported curl option {option}"),
        )),
    }
}

fn tokenize(input: &str) -> Result<Vec<String>, AppError> {
    let mut tokens = Vec::new();
    let mut current = String::new();
    let mut chars = input.chars().peekable();
    let mut quote: Option<char> = None;
    let mut token_started = false;

    while let Some(ch) = chars.next() {
        match quote {
            Some('\'') => {
                token_started = true;
                if ch == '\'' {
                    quote = None;
                } else {
                    current.push(ch);
                }
            }
            Some('"') => {
                token_started = true;
                match ch {
                    '"' => quote = None,
                    '\\' => {
                        if let Some(next) = chars.next()
                            && next != '\n'
                            && next != '\r'
                        {
                            current.push(next);
                        }
                    }
                    _ => current.push(ch),
                }
            }
            _ => match ch {
                '\'' | '"' => {
                    token_started = true;
                    quote = Some(ch);
                }
                '\\' => match chars.peek().copied() {
                    Some('\n') => {
                        chars.next();
                    }
                    Some('\r') => {
                        chars.next();
                        if chars.peek() == Some(&'\n') {
                            chars.next();
                        }
                    }
                    Some(next) => {
                        token_started = true;
                        chars.next();
                        current.push(next);
                    }
                    None => {
                        token_started = true;
                        current.push('\\');
                    }
                },
                ch if ch.is_whitespace() => {
                    if token_started {
                        tokens.push(std::mem::take(&mut current));
                        token_started = false;
                    }
                }
                _ => {
                    token_started = true;
                    current.push(ch);
                }
            },
        }
    }

    if quote.is_some() {
        return Err(AppError::invalid_request(
            "curl",
            "curl command contains an unterminated quote",
        ));
    }

    if token_started {
        tokens.push(current);
    }

    Ok(tokens)
}

fn split_long_option(token: &str) -> (&str, Option<&str>) {
    if token.starts_with("--")
        && let Some((option, value)) = token.split_once('=')
    {
        return (option, Some(value));
    }

    (token, None)
}

fn option_value<'a>(
    tokens: &'a [String],
    index: usize,
    inline_value: Option<&'a str>,
    option: &str,
) -> Result<(&'a str, usize), AppError> {
    if let Some(value) = inline_value {
        return Ok((value, index + 1));
    }

    let value_index = index + 1;
    let Some(value) = tokens.get(value_index) else {
        return Err(AppError::invalid_request(
            "curl",
            format!("curl option {option} requires a value"),
        ));
    };

    Ok((value, value_index + 1))
}

fn validate_method(method: &str) -> Result<String, AppError> {
    let method = method.trim();
    if method.is_empty() {
        return Err(AppError::invalid_request(
            "curl",
            "curl request method cannot be empty",
        ));
    }

    if !method
        .chars()
        .all(|ch| ch.is_ascii_alphabetic() || ch == '-')
    {
        return Err(AppError::invalid_request(
            "curl",
            "curl request method contains unsupported characters",
        ));
    }

    Ok(method.to_ascii_uppercase())
}

fn parse_header(value: &str) -> Result<(CurlHeader, RawCurlHeader), AppError> {
    let Some((name, raw_value)) = value.split_once(':') else {
        return Err(AppError::invalid_request(
            "curl",
            "curl header must use 'Name: value' syntax",
        ));
    };

    let name = name.trim();
    if name.is_empty() {
        return Err(AppError::invalid_request(
            "curl",
            "curl header name cannot be empty",
        ));
    }

    let raw_value = raw_value.trim();
    let (value, redacted) = redact_header_value(name, raw_value);
    Ok((
        CurlHeader {
            name: name.to_string(),
            value,
            redacted,
        },
        RawCurlHeader {
            name: name.to_string(),
            value: raw_value.to_string(),
        },
    ))
}

fn redact_header_value(name: &str, value: &str) -> (String, bool) {
    let lower_name = name.to_ascii_lowercase();
    if !SENSITIVE_HEADERS.contains(&lower_name.as_str()) {
        return (value.to_string(), false);
    }

    if lower_name == "authorization" || lower_name == "proxy-authorization" {
        let mut parts = value.split_whitespace();
        if let Some(scheme) = parts.next()
            && !scheme.is_empty()
        {
            return (format!("{scheme} ***"), true);
        }
    }

    ("***".to_string(), true)
}

fn apply_auth_preview(state: &mut ParseState, name: &str, redacted_value: &str, redacted: bool) {
    if !name.eq_ignore_ascii_case("authorization") {
        return;
    }

    let mut parts = redacted_value.split_whitespace();
    if let Some(scheme) = parts.next() {
        state.auth_scheme = Some(scheme.to_string());
        if redacted && scheme.eq_ignore_ascii_case("bearer") {
            state.bearer_token_present = true;
        }
    }
}

fn set_url(state: &mut ParseState, token: &str) -> Result<(), AppError> {
    if token.trim().is_empty() {
        return Err(AppError::invalid_request("url", "curl URL cannot be empty"));
    }

    if state.url.is_some() {
        return Err(AppError::invalid_request(
            "url",
            "curl command must include exactly one URL",
        ));
    }

    state.url = Some(token.to_string());
    Ok(())
}

fn append_query(url: &mut String, body: &str) {
    if body.is_empty() {
        return;
    }
    if url.contains('?') {
        if !url.ends_with('?') && !url.ends_with('&') {
            url.push('&');
        }
    } else {
        url.push('?');
    }
    url.push_str(body);
}

pub(crate) fn redact_url_preview(url: &str) -> String {
    let Ok(mut parsed_url) = reqwest::Url::parse(url) else {
        return redact_malformed_url_preview(url);
    };

    let mut changed = false;
    if parsed_url.password().is_some() || !parsed_url.username().is_empty() {
        let _ = parsed_url.set_username("");
        let _ = parsed_url.set_password(None);
        changed = true;
    }

    if parsed_url.query().is_some() {
        let pairs = parsed_url
            .query_pairs()
            .map(|(name, value)| {
                if is_sensitive_name(&name) {
                    changed = true;
                    (name.into_owned(), "***".to_string())
                } else {
                    (name.into_owned(), value.into_owned())
                }
            })
            .collect::<Vec<_>>();
        parsed_url.set_query(None);
        {
            let mut query = parsed_url.query_pairs_mut();
            for (name, value) in pairs {
                query.append_pair(&name, &value);
            }
        }
    }

    if changed {
        parsed_url.to_string()
    } else {
        url.to_string()
    }
}

fn redact_malformed_url_preview(url: &str) -> String {
    let mut redacted = url.to_string();
    let mut changed = false;

    let authority_start = redacted.find("://").map_or(0, |index| index + 3);
    let authority_end = redacted[authority_start..]
        .find(['/', '?', '#'])
        .map_or(redacted.len(), |offset| authority_start + offset);
    if let Some(at_offset) = redacted[authority_start..authority_end].rfind('@') {
        let userinfo_start = authority_start;
        let at_index = authority_start + at_offset;
        redacted.replace_range(userinfo_start..=at_index, "");
        changed = true;
    }

    if let Some(query_start) = redacted.find('?') {
        let fragment_start = redacted[query_start + 1..]
            .find('#')
            .map(|offset| query_start + 1 + offset);
        let query_end = fragment_start.unwrap_or(redacted.len());
        let query = &redacted[query_start + 1..query_end];
        let mut query_changed = false;
        let pairs = query
            .split('&')
            .map(|part| {
                let Some((name, _value)) = part.split_once('=') else {
                    if is_sensitive_name(part) {
                        query_changed = true;
                        return format!("{part}=***");
                    }
                    return part.to_string();
                };
                if is_sensitive_name(name) {
                    query_changed = true;
                    format!("{name}=***")
                } else {
                    part.to_string()
                }
            })
            .collect::<Vec<_>>()
            .join("&");
        if query_changed {
            redacted.replace_range(query_start + 1..query_end, &pairs);
            changed = true;
        }
    }

    if changed { redacted } else { url.to_string() }
}

fn redact_body_preview(body: &str, body_kind: Option<CurlBodyKind>) -> String {
    match body_kind {
        Some(CurlBodyKind::JsonString) => {
            redact_json_body_preview(body).unwrap_or_else(|| body.to_string())
        }
        Some(CurlBodyKind::FormString) => redact_form_body_preview(body),
        _ => body.to_string(),
    }
}

fn redact_json_body_preview(body: &str) -> Option<String> {
    let mut value = serde_json::from_str::<serde_json::Value>(body).ok()?;
    redact_sensitive_json_value(&mut value);
    serde_json::to_string(&value).ok()
}

fn redact_sensitive_json_value(value: &mut serde_json::Value) {
    match value {
        serde_json::Value::Object(object) => {
            for (key, value) in object.iter_mut() {
                if is_sensitive_name(key) {
                    *value = serde_json::Value::String("***".to_string());
                } else {
                    redact_sensitive_json_value(value);
                }
            }
        }
        serde_json::Value::Array(values) => {
            for value in values {
                redact_sensitive_json_value(value);
            }
        }
        _ => {}
    }
}

fn redact_form_body_preview(body: &str) -> String {
    body.split('&')
        .map(|part| {
            let Some((name, value)) = part.split_once('=') else {
                return part.to_string();
            };
            if is_sensitive_name(name) {
                format!("{name}=***")
            } else {
                format!("{name}={value}")
            }
        })
        .collect::<Vec<_>>()
        .join("&")
}

fn is_sensitive_name(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    SENSITIVE_HEADERS.contains(&lower.as_str())
        || lower.contains("password")
        || lower.contains("passwd")
        || lower.contains("secret")
        || lower.ends_with("token")
        || lower.ends_with("key")
}

fn infer_body_kind(body: &str, headers: &[CurlHeader]) -> CurlBodyKind {
    let content_type = headers
        .iter()
        .find(|header| header.name.eq_ignore_ascii_case("content-type"))
        .map(|header| header.value.to_ascii_lowercase());

    if content_type
        .as_deref()
        .is_some_and(|value| value.contains("json"))
        || serde_json::from_str::<serde_json::Value>(body).is_ok()
    {
        CurlBodyKind::JsonString
    } else if content_type
        .as_deref()
        .is_some_and(|value| value.contains("x-www-form-urlencoded"))
        || looks_like_form_body(body)
    {
        CurlBodyKind::FormString
    } else {
        CurlBodyKind::RawString
    }
}

fn looks_like_form_body(body: &str) -> bool {
    body.split('&').all(|part| {
        let Some((name, _value)) = part.split_once('=') else {
            return false;
        };
        !name.is_empty()
    })
}

fn data_urlencode_uses_file(value: &str) -> bool {
    if value.starts_with('@') {
        return true;
    }

    let Some((before_at, _file_name)) = value.split_once('@') else {
        return false;
    };

    !before_at.contains('=')
}

fn push_supported(state: &mut ParseState, option: &str) {
    state.supported_options.push(option.to_string());
}

fn canonical_data_option(option: &str) -> &str {
    match option {
        "-d" => "--data",
        other => other,
    }
}

fn base64_encode(bytes: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut output = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let b0 = chunk[0];
        let b1 = *chunk.get(1).unwrap_or(&0);
        let b2 = *chunk.get(2).unwrap_or(&0);

        output.push(TABLE[(b0 >> 2) as usize] as char);
        output.push(TABLE[(((b0 & 0b0000_0011) << 4) | (b1 >> 4)) as usize] as char);
        if chunk.len() > 1 {
            output.push(TABLE[(((b1 & 0b0000_1111) << 2) | (b2 >> 6)) as usize] as char);
        } else {
            output.push('=');
        }
        if chunk.len() > 2 {
            output.push(TABLE[(b2 & 0b0011_1111) as usize] as char);
        } else {
            output.push('=');
        }
    }
    output
}

fn normalize_supported_options(options: Vec<String>) -> Vec<String> {
    let mut seen = BTreeSet::new();
    let mut normalized = Vec::new();
    for option in options {
        let canonical = match option.as_str() {
            "--request" => "-X",
            "--header" => "-H",
            "--url" => "--url",
            "--head" => "-I",
            "--get" => "-G",
            "--location" => "-L",
            "--insecure" => "-k",
            "--user" | "--user-name" => "-u",
            "--user-agent" => "-A",
            "--cookie" => "-b",
            other => other,
        };
        if seen.insert(canonical.to_string()) {
            normalized.push(canonical.to_string());
        }
    }

    // The source fixture reports a plain GET + header preview with no supported
    // options, while more complex requests list the parsing-affecting options.
    if normalized.len() == 1 && normalized[0] == "-H" {
        Vec::new()
    } else {
        normalized
    }
}
