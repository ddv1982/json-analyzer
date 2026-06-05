use std::fmt;

use serde::{Deserialize, Serialize};

use crate::ParseError;

/// Serializable, ProblemDetails-like application error.
///
/// `AppError` flattens to the same fields as [`ProblemDetails`] so Tauri can
/// return it directly today and a future HTTP adapter can map `status` without
/// changing the service contract.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AppError {
    #[serde(flatten)]
    pub problem: Box<ProblemDetails>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProblemDetails {
    pub error_type: String,
    pub title: String,
    pub status: Option<u16>,
    pub detail: String,
    pub instance: Option<String>,
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub invalid_params: Vec<InvalidParam>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub position: Option<ErrorPosition>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct InvalidParam {
    pub name: String,
    pub reason: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ErrorPosition {
    pub offset: usize,
    pub line: usize,
    pub column: usize,
}

impl AppError {
    #[must_use]
    pub fn invalid_request(param: &str, detail: impl Into<String>) -> Self {
        let detail = detail.into();
        Self::new(
            "invalid_request",
            "Invalid request",
            Some(400),
            detail.clone(),
        )
        .with_invalid_param(param, detail)
    }

    #[must_use]
    pub fn json_too_large(max_json_bytes: usize) -> Self {
        Self::invalid_request(
            "json_string",
            format!("JSON string too large (max {max_json_bytes} bytes)"),
        )
    }

    #[must_use]
    pub fn json_too_deep(max_json_depth: usize) -> Self {
        Self::invalid_request(
            "json_string",
            format!("JSON nesting too deep (max depth {max_json_depth})"),
        )
    }

    #[must_use]
    pub fn parse(error: &ParseError) -> Self {
        Self::new(
            "json_parse_error",
            "Invalid JSON",
            Some(400),
            error.to_string(),
        )
        .with_position(ErrorPosition {
            offset: error.offset,
            line: error.line,
            column: error.column,
        })
    }

    #[must_use]
    pub fn unsupported_config(param: &str, detail: impl Into<String>) -> Self {
        let detail = detail.into();
        Self::new(
            "unsupported_config",
            "Unsupported configuration",
            Some(501),
            detail.clone(),
        )
        .with_invalid_param(param, detail)
    }

    #[must_use]
    pub fn unsupported_file_upload_option(param: &str, option: impl Into<String>) -> Self {
        let option = option.into();
        Self::new(
            "unsupported_file_upload_option",
            "Unsupported curl file upload option",
            Some(400),
            "File upload curl options are not supported by the desktop curl parser",
        )
        .with_invalid_param(param, format!("unsupported file upload option {option}"))
    }

    #[must_use]
    pub fn curl_guardrail_denied(param: &str, reason: impl Into<String>) -> Self {
        let reason = reason.into();
        Self::new(
            "curl_guardrail_denied",
            "Curl request blocked",
            Some(403),
            reason.clone(),
        )
        .with_invalid_param(param, reason)
    }

    #[must_use]
    pub fn curl_timeout(timeout_ms: u64) -> Self {
        Self::new(
            "curl_timeout",
            "Curl request timed out",
            Some(504),
            format!("Curl request timed out after {timeout_ms} ms"),
        )
        .with_invalid_param("timeout_ms", format!("request exceeded {timeout_ms} ms"))
    }

    #[must_use]
    pub fn curl_network_error(detail: impl Into<String>) -> Self {
        Self::new(
            "curl_network_error",
            "Curl network error",
            Some(502),
            detail.into(),
        )
    }

    #[must_use]
    pub fn curl_response_too_large(max_response_bytes: usize) -> Self {
        Self::new(
            "curl_response_too_large",
            "Curl response too large",
            Some(413),
            format!("Curl response exceeded preview limit of {max_response_bytes} bytes"),
        )
        .with_invalid_param(
            "max_response_bytes",
            format!("response preview limit is {max_response_bytes} bytes"),
        )
    }

    #[must_use]
    pub fn new(
        error_type: impl Into<String>,
        title: impl Into<String>,
        status: Option<u16>,
        detail: impl Into<String>,
    ) -> Self {
        Self {
            problem: Box::new(ProblemDetails {
                error_type: error_type.into(),
                title: title.into(),
                status,
                detail: detail.into(),
                instance: None,
                invalid_params: Vec::new(),
                position: None,
            }),
        }
    }

    #[must_use]
    pub fn with_instance(mut self, instance: impl Into<String>) -> Self {
        self.problem.instance = Some(instance.into());
        self
    }

    #[must_use]
    pub fn with_invalid_param(
        mut self,
        name: impl Into<String>,
        reason: impl Into<String>,
    ) -> Self {
        self.problem.invalid_params.push(InvalidParam {
            name: name.into(),
            reason: reason.into(),
        });
        self
    }

    #[must_use]
    pub fn with_position(mut self, position: ErrorPosition) -> Self {
        self.problem.position = Some(position);
        self
    }
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}: {}", self.problem.title, self.problem.detail)
    }
}

impl std::error::Error for AppError {}
