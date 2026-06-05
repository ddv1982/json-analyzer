use crate::{
    AdvancedFieldDuplicatesRequest, AppError, CompositeDuplicatesRequest, CurlGuardrailRequest,
    DuplicateFilter, DuplicateLimitsConfig, ValuesAnalysisRequest, ValuesExplorerAnalysisRequest,
    ValuesExplorerFilter, ValuesExplorerLimitsConfig,
};

pub(super) fn validate_curl_guardrail_request(
    request: &CurlGuardrailRequest,
) -> Result<(), AppError> {
    if request.method.trim().is_empty() {
        return Err(AppError::invalid_request(
            "method",
            "curl guardrail method cannot be empty",
        ));
    }

    if !request
        .method
        .trim()
        .chars()
        .all(|ch| ch.is_ascii_alphabetic() || ch == '-')
    {
        return Err(AppError::invalid_request(
            "method",
            "curl guardrail method contains unsupported characters",
        ));
    }

    if request.url.trim().is_empty() {
        return Err(AppError::invalid_request(
            "url",
            "curl guardrail URL cannot be empty",
        ));
    }

    if let Some(redirect_target) = request.redirect_target.as_ref()
        && redirect_target.trim().is_empty()
    {
        return Err(AppError::invalid_request(
            "redirect_target",
            "curl guardrail redirect target cannot be empty when provided",
        ));
    }

    Ok(())
}

pub(super) fn validate_advanced_field_duplicates_request(
    request: &AdvancedFieldDuplicatesRequest,
    limits: &DuplicateLimitsConfig,
) -> Result<(), AppError> {
    if request.field_path.trim().is_empty() {
        return Err(AppError::invalid_request(
            "field_path",
            "field_path cannot be empty",
        ));
    }

    validate_duplicate_filter(request.filter.as_ref())?;
    validate_pagination(request.page, request.page_size)?;
    validate_max_page_size(request.page_size, limits.max_page_size)
}

pub(super) fn validate_composite_duplicates_request(
    request: &CompositeDuplicatesRequest,
    limits: &DuplicateLimitsConfig,
) -> Result<Vec<String>, AppError> {
    if request.field_paths.len() < limits.composite_min_fields
        || request.field_paths.len() > limits.composite_max_fields
    {
        return Err(AppError::invalid_request(
            "field_paths",
            format!(
                "field_paths supports {} to {} fields",
                limits.composite_min_fields, limits.composite_max_fields
            ),
        ));
    }

    let trimmed_fields = request
        .field_paths
        .iter()
        .map(|field| field.trim().to_string())
        .collect::<Vec<_>>();

    if trimmed_fields.iter().any(String::is_empty) {
        return Err(AppError::invalid_request(
            "field_paths",
            "field_paths cannot contain empty fields",
        ));
    }

    let mut unique_fields = std::collections::BTreeSet::new();
    if !trimmed_fields
        .iter()
        .all(|field| unique_fields.insert(field))
    {
        return Err(AppError::invalid_request(
            "field_paths",
            "field_paths must contain unique fields",
        ));
    }

    validate_duplicate_filter(request.filter.as_ref())?;
    validate_pagination(request.page, request.page_size)?;
    validate_max_page_size(request.page_size, limits.max_page_size)?;
    Ok(trimmed_fields)
}

pub(super) fn validate_max_page_size(
    page_size: usize,
    max_page_size: usize,
) -> Result<(), AppError> {
    if page_size > max_page_size {
        return Err(AppError::invalid_request(
            "page_size",
            format!("page_size cannot exceed {max_page_size}"),
        ));
    }

    Ok(())
}

pub(super) fn validate_duplicate_filter(filter: Option<&DuplicateFilter>) -> Result<(), AppError> {
    if let Some(filter) = filter
        && filter.field_path.trim().is_empty()
    {
        return Err(AppError::invalid_request(
            "filter.field_path",
            "filter.field_path cannot be empty",
        ));
    }

    Ok(())
}

pub(super) fn validate_pagination(page: usize, page_size: usize) -> Result<(), AppError> {
    if page == 0 {
        return Err(AppError::invalid_request(
            "page",
            "page must be greater than or equal to 1",
        ));
    }

    if page_size == 0 {
        return Err(AppError::invalid_request(
            "page_size",
            "page_size must be greater than or equal to 1",
        ));
    }

    Ok(())
}

pub(super) fn validate_values_request(
    request: &ValuesAnalysisRequest,
    limits: &ValuesExplorerLimitsConfig,
) -> Result<Vec<String>, AppError> {
    if request.selected_fields.is_empty()
        || request.selected_fields.len() > limits.max_selected_fields
    {
        return Err(AppError::invalid_request(
            "selected_fields",
            format!(
                "selected_fields supports 1 to {} fields",
                limits.max_selected_fields
            ),
        ));
    }

    let selected_fields = request
        .selected_fields
        .iter()
        .map(|field| field.trim().to_string())
        .collect::<Vec<_>>();

    if selected_fields.iter().any(String::is_empty) {
        return Err(AppError::invalid_request(
            "selected_fields",
            "selected_fields cannot contain empty fields",
        ));
    }

    let mut unique_fields = std::collections::BTreeSet::new();
    if !selected_fields
        .iter()
        .all(|field| unique_fields.insert(field))
    {
        return Err(AppError::invalid_request(
            "selected_fields",
            "selected_fields must contain unique fields",
        ));
    }

    validate_pagination(request.page, request.page_size)?;
    validate_max_page_size(request.page_size, limits.max_page_size)?;
    Ok(selected_fields)
}

pub(super) fn validate_values_explorer_request(
    request: &ValuesExplorerAnalysisRequest,
    limits: &ValuesExplorerLimitsConfig,
) -> Result<Vec<String>, AppError> {
    if request.selected_fields.is_empty()
        || request.selected_fields.len() > limits.max_selected_fields
    {
        return Err(AppError::invalid_request(
            "selected_fields",
            format!(
                "selected_fields supports 1 to {} fields",
                limits.max_selected_fields
            ),
        ));
    }

    let selected_fields = request
        .selected_fields
        .iter()
        .map(|field| field.trim().to_string())
        .collect::<Vec<_>>();

    if selected_fields.iter().any(String::is_empty) {
        return Err(AppError::invalid_request(
            "selected_fields",
            "selected_fields cannot contain empty fields",
        ));
    }

    let mut unique_fields = std::collections::BTreeSet::new();
    if !selected_fields
        .iter()
        .all(|field| unique_fields.insert(field))
    {
        return Err(AppError::invalid_request(
            "selected_fields",
            "selected_fields must contain unique fields",
        ));
    }

    validate_values_explorer_filter(request.filter.as_ref())?;
    validate_pagination(request.page, request.page_size)?;
    if let Some(groups_page) = request.groups_page
        && groups_page == 0
    {
        return Err(AppError::invalid_request(
            "groups_page",
            "groups_page must be greater than or equal to 1",
        ));
    }
    validate_max_page_size(request.page_size, limits.max_page_size)?;
    Ok(selected_fields)
}

pub(super) fn validate_values_explorer_filter(
    filter: Option<&ValuesExplorerFilter>,
) -> Result<(), AppError> {
    if let Some(filter) = filter {
        if filter.field_path.trim().is_empty() {
            return Err(AppError::invalid_request(
                "filter.field_path",
                "filter.field_path cannot be empty",
            ));
        }

        if filter.value.trim().is_empty() {
            return Err(AppError::invalid_request(
                "filter.value",
                "filter.value cannot be empty",
            ));
        }
    }

    Ok(())
}
