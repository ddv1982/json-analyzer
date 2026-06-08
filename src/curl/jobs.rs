use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{SystemTime, UNIX_EPOCH};

const MAX_ACTIVE_JOBS: usize = 8;
const MAX_RETAINED_TERMINAL_JOBS: usize = 50;
#[cfg(not(test))]
const MAX_RETAINED_TERMINAL_BYTES: usize = 128 * 1024 * 1024;
#[cfg(test)]
const MAX_RETAINED_TERMINAL_BYTES: usize = 1024;

use crate::curl::executor::normalize_timeout_ms;
use crate::{
    AppError, CurlExecuteRequest, CurlHttpClient, CurlJobRequest, CurlJobResponse, CurlJobResult,
    CurlJobResultsResponse, CurlJobStatus, CurlJobSummary, CurlLimitsConfig, CurlStartJobRequest,
    ParsedCurlPreview, ReqwestCurlHttpClient, SerializableInvalidParam, SerializableProblem,
    execute_curl_request_with_client, parse_curl,
};

#[derive(Debug, Clone, Default)]
pub struct CurlJobManager {
    inner: Arc<Mutex<HashMap<String, JobRecord>>>,
    next_id: Arc<AtomicU64>,
}

#[derive(Debug, Clone)]
struct JobRecord {
    summary: CurlJobSummary,
    results: Vec<CurlJobResult>,
    cancel_requested: Arc<AtomicBool>,
    worker_active: bool,
}

struct JobWorker {
    job_id: String,
    generated_curls: Vec<String>,
    generated_input_values: Vec<Option<String>>,
    timeout_ms: Option<u64>,
    max_concurrency: usize,
    follow_redirects: bool,
    limits: CurlLimitsConfig,
    client: Arc<dyn CurlHttpClient>,
    cancel_requested: Arc<AtomicBool>,
}

struct JobWorkerLifecycle {
    manager: CurlJobManager,
    job_id: String,
}

struct PreparedCurlJobRequest {
    generated_curls: Vec<String>,
    generated_input_values: Vec<Option<String>>,
    timeout_ms: Option<u64>,
    max_concurrency: usize,
    follow_redirects: bool,
    confirm_large_batch: bool,
}

impl Drop for JobWorkerLifecycle {
    fn drop(&mut self) {
        self.manager.finish_worker(&self.job_id);
    }
}

impl CurlJobManager {
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    pub fn start_job(
        &self,
        request: CurlStartJobRequest,
        limits: CurlLimitsConfig,
    ) -> Result<CurlJobResponse, AppError> {
        self.start_job_with_client(request, limits, Arc::new(ReqwestCurlHttpClient))
    }

    pub fn start_job_with_client(
        &self,
        request: CurlStartJobRequest,
        limits: CurlLimitsConfig,
        client: Arc<dyn CurlHttpClient>,
    ) -> Result<CurlJobResponse, AppError> {
        let prepared = prepare_start_job_request(request, &limits)?;

        let generated_curls = prepared.generated_curls;
        let generated_input_values = prepared.generated_input_values;
        let timeout_ms = prepared.timeout_ms;
        let max_concurrency = prepared.max_concurrency;
        let follow_redirects = prepared.follow_redirects;
        let total_requests = generated_curls.len();
        let now = now_utc_string();
        let job_id = self.next_job_id();
        let cancel_requested = Arc::new(AtomicBool::new(false));
        let summary = CurlJobSummary {
            job_id: job_id.clone(),
            status: CurlJobStatus::Queued,
            total_requests,
            completed_requests: 0,
            failed_requests: 0,
            canceled_requests: 0,
            created_at_utc: now.clone(),
            updated_at_utc: now,
        };
        let results = (0..total_requests)
            .map(|index| CurlJobResult {
                index,
                status: CurlJobStatus::Queued,
                input_value: generated_input_values[index].clone(),
                request_preview: None,
                response: None,
                error: None,
            })
            .collect::<Vec<_>>();

        {
            let mut jobs = self.inner.lock().unwrap();
            prune_terminal_jobs(&mut jobs);
            let active_jobs = jobs.values().filter(|record| record.worker_active).count();
            if active_jobs >= MAX_ACTIVE_JOBS {
                return Err(AppError::invalid_request(
                    "curl_job",
                    format!("too many active curl jobs (max {MAX_ACTIVE_JOBS})"),
                ));
            }
            jobs.insert(
                job_id.clone(),
                JobRecord {
                    summary: summary.clone(),
                    results,
                    cancel_requested: cancel_requested.clone(),
                    worker_active: true,
                },
            );
        }

        let manager = self.clone();
        let worker = JobWorker {
            job_id: job_id.clone(),
            generated_curls,
            generated_input_values,
            timeout_ms,
            max_concurrency,
            follow_redirects,
            limits,
            client,
            cancel_requested,
        };
        thread::spawn(move || {
            manager.run_job(worker);
        });

        Ok(CurlJobResponse { job: summary })
    }

    pub fn get_job_results(
        &self,
        request: CurlJobRequest,
    ) -> Result<CurlJobResultsResponse, AppError> {
        let job_id = validate_job_id(request.job_id)?;
        let jobs = self.inner.lock().unwrap();
        let record = jobs
            .get(&job_id)
            .ok_or_else(|| AppError::invalid_request("job_id", "curl job not found"))?;
        Ok(CurlJobResultsResponse {
            job: record.summary.clone(),
            results: record.results.clone(),
        })
    }

    pub fn cancel_job(&self, request: CurlJobRequest) -> Result<CurlJobResponse, AppError> {
        let job_id = validate_job_id(request.job_id)?;
        let mut jobs = self.inner.lock().unwrap();
        let record = jobs
            .get_mut(&job_id)
            .ok_or_else(|| AppError::invalid_request("job_id", "curl job not found"))?;

        if is_terminal(record.summary.status) {
            return Ok(CurlJobResponse {
                job: record.summary.clone(),
            });
        }

        record.cancel_requested.store(true, Ordering::SeqCst);
        mark_record_canceled(record);
        Ok(CurlJobResponse {
            job: record.summary.clone(),
        })
    }

    fn run_job(&self, worker: JobWorker) {
        let worker_lifecycle = JobWorkerLifecycle {
            manager: self.clone(),
            job_id: worker.job_id.clone(),
        };

        if !self.mark_running(&worker.job_id) {
            return;
        }

        if worker.max_concurrency <= 1 || worker.generated_curls.len() <= 1 {
            self.run_job_sequential(worker);
        } else {
            self.run_job_concurrent(worker);
        }

        self.finish_job(&worker_lifecycle.job_id);
    }

    fn run_job_sequential(&self, worker: JobWorker) {
        for (index, curl) in worker.generated_curls.iter().enumerate() {
            let input_value = worker.generated_input_values.get(index).cloned().flatten();
            if worker.cancel_requested.load(Ordering::SeqCst) {
                self.cancel_remaining(&worker.job_id);
                return;
            }

            if !self.mark_item_running(&worker.job_id, index) {
                return;
            }

            let result = match execute_curl_request_with_client(
                CurlExecuteRequest {
                    curl: curl.to_string(),
                    timeout_ms: worker.timeout_ms,
                    follow_redirects: worker.follow_redirects,
                },
                &worker.limits,
                worker.client.as_ref(),
            ) {
                Ok(response) => CurlJobResult {
                    index,
                    status: CurlJobStatus::Succeeded,
                    input_value,
                    request_preview: Some(response.request_preview),
                    response: response.response,
                    error: None,
                },
                Err(error) => CurlJobResult {
                    index,
                    status: CurlJobStatus::Failed,
                    input_value,
                    request_preview: redacted_preview(curl),
                    response: None,
                    error: Some(to_serializable_problem(error)),
                },
            };

            if worker.cancel_requested.load(Ordering::SeqCst) {
                self.cancel_remaining(&worker.job_id);
                return;
            }

            if !self.complete_item(&worker.job_id, result) {
                return;
            }
        }
    }

    fn run_job_concurrent(&self, worker: JobWorker) {
        let next_index = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let worker_count = worker.max_concurrency.min(worker.generated_curls.len());

        std::thread::scope(|scope| {
            for _ in 0..worker_count {
                let next_index = next_index.clone();
                let cancel_requested = worker.cancel_requested.clone();
                let client = worker.client.clone();
                let manager = self.clone();
                let job_id = worker.job_id.clone();
                let generated_curls = &worker.generated_curls;
                let generated_input_values = &worker.generated_input_values;
                let limits = &worker.limits;
                let timeout_ms = worker.timeout_ms;
                let follow_redirects = worker.follow_redirects;

                scope.spawn(move || {
                    loop {
                        if cancel_requested.load(Ordering::SeqCst) {
                            manager.cancel_remaining(&job_id);
                            return;
                        }

                        let index = next_index.fetch_add(1, Ordering::SeqCst);
                        let Some(curl) = generated_curls.get(index) else {
                            return;
                        };

                        if !manager.mark_item_running(&job_id, index) {
                            return;
                        }

                        let input_value = generated_input_values.get(index).cloned().flatten();
                        let result = match execute_curl_request_with_client(
                            CurlExecuteRequest {
                                curl: curl.to_string(),
                                timeout_ms,
                                follow_redirects,
                            },
                            limits,
                            client.as_ref(),
                        ) {
                            Ok(response) => CurlJobResult {
                                index,
                                status: CurlJobStatus::Succeeded,
                                input_value,
                                request_preview: Some(response.request_preview),
                                response: response.response,
                                error: None,
                            },
                            Err(error) => CurlJobResult {
                                index,
                                status: CurlJobStatus::Failed,
                                input_value,
                                request_preview: redacted_preview(curl),
                                response: None,
                                error: Some(to_serializable_problem(error)),
                            },
                        };

                        if cancel_requested.load(Ordering::SeqCst) {
                            manager.cancel_remaining(&job_id);
                            return;
                        }

                        if !manager.complete_item(&job_id, result) {
                            return;
                        }
                    }
                });
            }
        });
    }

    fn next_job_id(&self) -> String {
        let sequence = self.next_id.fetch_add(1, Ordering::Relaxed) + 1;
        let millis = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_millis())
            .unwrap_or_default();
        format!("curl-job-{millis}-{sequence}")
    }

    fn mark_running(&self, job_id: &str) -> bool {
        let mut jobs = self.inner.lock().unwrap();
        let Some(record) = jobs.get_mut(job_id) else {
            return false;
        };
        if is_terminal(record.summary.status) {
            return false;
        }
        record.summary.status = CurlJobStatus::Running;
        record.summary.updated_at_utc = now_utc_string();
        true
    }

    fn mark_item_running(&self, job_id: &str, index: usize) -> bool {
        let mut jobs = self.inner.lock().unwrap();
        let Some(record) = jobs.get_mut(job_id) else {
            return false;
        };
        if is_terminal(record.summary.status) {
            return false;
        }
        if let Some(result) = record.results.get_mut(index) {
            result.status = CurlJobStatus::Running;
        }
        record.summary.updated_at_utc = now_utc_string();
        true
    }

    fn complete_item(&self, job_id: &str, result: CurlJobResult) -> bool {
        let mut jobs = self.inner.lock().unwrap();
        let Some(record) = jobs.get_mut(job_id) else {
            return false;
        };
        if record.summary.status == CurlJobStatus::Canceled {
            return false;
        }

        if let Some(slot) = record.results.get_mut(result.index) {
            *slot = result.clone();
        }
        match result.status {
            CurlJobStatus::Succeeded => record.summary.completed_requests += 1,
            CurlJobStatus::Failed => record.summary.failed_requests += 1,
            CurlJobStatus::Canceled => record.summary.canceled_requests += 1,
            CurlJobStatus::Queued | CurlJobStatus::Running => {}
        }
        record.summary.updated_at_utc = now_utc_string();
        true
    }

    fn cancel_remaining(&self, job_id: &str) {
        let mut jobs = self.inner.lock().unwrap();
        if let Some(record) = jobs.get_mut(job_id)
            && record.summary.status != CurlJobStatus::Canceled
        {
            mark_record_canceled(record);
        }
    }

    fn finish_job(&self, job_id: &str) {
        let mut jobs = self.inner.lock().unwrap();
        let Some(record) = jobs.get_mut(job_id) else {
            return;
        };
        if record.summary.status == CurlJobStatus::Canceled {
            return;
        }
        record.summary.status = if record.summary.failed_requests > 0 {
            CurlJobStatus::Failed
        } else {
            CurlJobStatus::Succeeded
        };
        record.summary.updated_at_utc = now_utc_string();
    }

    fn finish_worker(&self, job_id: &str) {
        let mut jobs = self.inner.lock().unwrap();
        if let Some(record) = jobs.get_mut(job_id) {
            record.worker_active = false;
            if !is_terminal(record.summary.status) {
                record.summary.updated_at_utc = now_utc_string();
            }
        }
        prune_terminal_jobs(&mut jobs);
    }
}

fn prune_terminal_jobs(jobs: &mut HashMap<String, JobRecord>) {
    let mut terminal_jobs = jobs
        .iter()
        .filter(|(_job_id, record)| is_terminal(record.summary.status) && !record.worker_active)
        .map(|(job_id, record)| {
            (
                record.summary.updated_at_utc.clone(),
                job_id.clone(),
                estimate_job_record_bytes(record),
            )
        })
        .collect::<Vec<_>>();
    if terminal_jobs.len() <= MAX_RETAINED_TERMINAL_JOBS
        && total_terminal_bytes(&terminal_jobs) <= MAX_RETAINED_TERMINAL_BYTES
    {
        return;
    }

    terminal_jobs.sort_by(|left, right| left.0.cmp(&right.0).then_with(|| left.1.cmp(&right.1)));
    let mut retained_count = terminal_jobs.len();
    let mut retained_bytes = total_terminal_bytes(&terminal_jobs);
    for (_updated_at, job_id, bytes) in terminal_jobs {
        if retained_count <= 1
            || (retained_count <= MAX_RETAINED_TERMINAL_JOBS
                && retained_bytes <= MAX_RETAINED_TERMINAL_BYTES)
        {
            break;
        }
        if jobs.remove(&job_id).is_some() {
            retained_count -= 1;
            retained_bytes = retained_bytes.saturating_sub(bytes);
        }
    }
}

fn total_terminal_bytes(terminal_jobs: &[(String, String, usize)]) -> usize {
    terminal_jobs
        .iter()
        .fold(0usize, |total, (_updated_at, _job_id, bytes)| {
            total.saturating_add(*bytes)
        })
}

fn estimate_job_record_bytes(record: &JobRecord) -> usize {
    record.summary.job_id.len()
        + record.summary.created_at_utc.len()
        + record.summary.updated_at_utc.len()
        + record.results.iter().fold(0usize, |total, result| {
            total.saturating_add(estimate_result_bytes(result))
        })
}

fn estimate_result_bytes(result: &CurlJobResult) -> usize {
    estimate_preview_bytes(result.request_preview.as_ref())
        .saturating_add(estimate_response_bytes(result.response.as_ref()))
        .saturating_add(estimate_error_bytes(result.error.as_ref()))
        .saturating_add(result.input_value.as_ref().map_or(0, String::len))
}

fn estimate_preview_bytes(preview: Option<&ParsedCurlPreview>) -> usize {
    let Some(preview) = preview else {
        return 0;
    };
    preview.method.len()
        + preview.url.len()
        + preview.body.as_ref().map_or(0, String::len)
        + preview.auth.scheme.as_ref().map_or(0, String::len)
        + preview.headers.iter().fold(0usize, |total, header| {
            total.saturating_add(header.name.len() + header.value.len())
        })
        + preview
            .supported_options
            .iter()
            .fold(0usize, |total, option| total.saturating_add(option.len()))
        + preview
            .warnings
            .iter()
            .fold(0usize, |total, warning| total.saturating_add(warning.len()))
}

fn estimate_response_bytes(response: Option<&crate::CurlHttpResponse>) -> usize {
    let Some(response) = response else {
        return 0;
    };
    response.status_text.as_ref().map_or(0, String::len)
        + response.body.len()
        + response.headers.iter().fold(0usize, |total, header| {
            total.saturating_add(header.name.len() + header.value.len())
        })
}

fn estimate_error_bytes(error: Option<&SerializableProblem>) -> usize {
    let Some(error) = error else {
        return 0;
    };
    error.error_type.len()
        + error.title.len()
        + error.detail.len()
        + error.invalid_params.iter().fold(0usize, |total, param| {
            total.saturating_add(param.name.len() + param.reason.len())
        })
}

fn prepare_start_job_request(
    request: CurlStartJobRequest,
    limits: &CurlLimitsConfig,
) -> Result<PreparedCurlJobRequest, AppError> {
    if !limits.enabled {
        return Err(AppError::unsupported_config(
            "limits.curl.enabled",
            "curl execution is disabled by configuration",
        ));
    }

    let (generated_curls, generated_input_values) = expand_start_job_request(&request, limits)?;
    validate_prepared_curls(&generated_curls)?;

    let prepared = PreparedCurlJobRequest {
        generated_curls,
        generated_input_values,
        timeout_ms: request.timeout_ms,
        max_concurrency: normalize_max_concurrency(request.max_concurrency, limits)?,
        follow_redirects: request.follow_redirects,
        confirm_large_batch: request.confirm_large_batch,
    };
    validate_start_job_request(&prepared, limits)?;
    Ok(prepared)
}

fn expand_start_job_request(
    request: &CurlStartJobRequest,
    limits: &CurlLimitsConfig,
) -> Result<(Vec<String>, Vec<Option<String>>), AppError> {
    let curl = request.curl.trim();
    if curl.is_empty() {
        return Err(AppError::invalid_request(
            "curl",
            "curl command cannot be empty",
        ));
    }

    let values = normalize_batch_values(&request.values);
    let placeholder = request
        .placeholder
        .as_ref()
        .map(|value| value.trim())
        .filter(|value| !value.is_empty());

    match (placeholder, values.is_empty()) {
        (None, true) => Ok((vec![curl.to_string()], vec![None])),
        (None, false) => Err(AppError::invalid_request(
            "placeholder",
            "batch placeholder is required when values are provided",
        )),
        (Some(_placeholder), true) => Err(AppError::invalid_request(
            "values",
            "batch values cannot be empty when a placeholder is selected",
        )),
        (Some(placeholder), false) => {
            if !curl.contains(placeholder) {
                return Err(AppError::invalid_request(
                    "placeholder",
                    format!("curl command must include the selected placeholder {placeholder}"),
                ));
            }
            if values.len() > limits.max_batch_size {
                return Err(AppError::invalid_request(
                    "values",
                    format!(
                        "curl batch cannot include more than {} requests",
                        limits.max_batch_size
                    ),
                ));
            }
            let generated_curls = values
                .iter()
                .map(|value| curl.replace(placeholder, value))
                .collect::<Vec<_>>();
            let generated_input_values = values.into_iter().map(Some).collect::<Vec<_>>();
            Ok((generated_curls, generated_input_values))
        }
    }
}

fn normalize_batch_values(values: &[String]) -> Vec<String> {
    values
        .iter()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .collect()
}

fn validate_prepared_curls(curls: &[String]) -> Result<(), AppError> {
    for (index, curl) in curls.iter().enumerate() {
        parse_curl(curl).map_err(|error| {
            AppError::invalid_request(
                "curl",
                format!(
                    "generated curl {} is invalid: {}",
                    index + 1,
                    error.problem.detail
                ),
            )
        })?;
    }
    Ok(())
}

fn normalize_max_concurrency(
    max_concurrency: Option<usize>,
    limits: &CurlLimitsConfig,
) -> Result<usize, AppError> {
    let max_concurrency = if let Some(max_concurrency) = max_concurrency {
        max_concurrency
    } else if limits.max_concurrency == 0 {
        1
    } else {
        limits
            .default_max_concurrency
            .clamp(1, limits.max_concurrency)
    };
    if max_concurrency == 0 {
        return Err(AppError::invalid_request(
            "max_concurrency",
            "curl batch concurrency must be at least 1",
        ));
    }
    if max_concurrency > limits.max_concurrency {
        return Err(AppError::invalid_request(
            "max_concurrency",
            format!(
                "curl batch concurrency cannot exceed {}",
                limits.max_concurrency
            ),
        ));
    }
    Ok(max_concurrency)
}

fn validate_start_job_request(
    request: &PreparedCurlJobRequest,
    limits: &CurlLimitsConfig,
) -> Result<(), AppError> {
    if request.generated_curls.len() > 1
        && limits.large_batch_confirmation_threshold > 0
        && request.generated_curls.len() >= limits.large_batch_confirmation_threshold
        && !request.confirm_large_batch
    {
        return Err(AppError::invalid_request(
            "confirm_large_batch",
            format!(
                "curl batch of {} requests requires confirmation",
                request.generated_curls.len()
            ),
        ));
    }
    normalize_timeout_ms(request.timeout_ms, limits)?;
    Ok(())
}

fn validate_job_id(job_id: String) -> Result<String, AppError> {
    let trimmed = job_id.trim();
    if trimmed.is_empty() {
        return Err(AppError::invalid_request(
            "job_id",
            "curl job id cannot be empty",
        ));
    }
    Ok(trimmed.to_string())
}

fn mark_record_canceled(record: &mut JobRecord) {
    record.summary.status = CurlJobStatus::Canceled;
    record.summary.canceled_requests = 0;
    for result in &mut record.results {
        if matches!(
            result.status,
            CurlJobStatus::Queued | CurlJobStatus::Running
        ) {
            result.status = CurlJobStatus::Canceled;
            result.error = None;
            result.response = None;
            record.summary.canceled_requests += 1;
        }
    }
    record.summary.updated_at_utc = now_utc_string();
}

fn is_terminal(status: CurlJobStatus) -> bool {
    matches!(
        status,
        CurlJobStatus::Succeeded | CurlJobStatus::Failed | CurlJobStatus::Canceled
    )
}

fn redacted_preview(curl: &str) -> Option<ParsedCurlPreview> {
    parse_curl(curl).ok()
}

fn to_serializable_problem(error: AppError) -> SerializableProblem {
    SerializableProblem {
        error_type: error.problem.error_type,
        title: error.problem.title,
        status: error.problem.status.unwrap_or(500),
        detail: error.problem.detail,
        invalid_params: error
            .problem
            .invalid_params
            .into_iter()
            .map(|param| SerializableInvalidParam {
                name: param.name,
                reason: param.reason,
            })
            .collect(),
    }
}

fn now_utc_string() -> String {
    let seconds = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default();
    format_unix_seconds_utc(seconds)
}

fn format_unix_seconds_utc(seconds: u64) -> String {
    let days = (seconds / 86_400) as i64;
    let seconds_of_day = seconds % 86_400;
    let (year, month, day) = civil_from_days(days);
    let hour = seconds_of_day / 3_600;
    let minute = (seconds_of_day % 3_600) / 60;
    let second = seconds_of_day % 60;
    format!("{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}Z")
}

fn civil_from_days(days_since_unix_epoch: i64) -> (i64, u64, u64) {
    let z = days_since_unix_epoch + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let day_of_era = z - era * 146_097;
    let year_of_era =
        (day_of_era - day_of_era / 1_460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let mut year = year_of_era + era * 400;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let month_piece = (5 * day_of_year + 2) / 153;
    let day = day_of_year - (153 * month_piece + 2) / 5 + 1;
    let month = month_piece + if month_piece < 10 { 3 } else { -9 };
    if month <= 2 {
        year += 1;
    }
    (year, month as u64, day as u64)
}

#[cfg(test)]
mod retention_tests {
    use super::*;
    use crate::CurlHttpResponse;

    #[test]
    fn prune_terminal_jobs_enforces_retained_byte_cap() {
        let mut jobs = HashMap::new();
        jobs.insert(
            "old".to_string(),
            terminal_record("old", "2026-06-05T00:00:00Z", 900),
        );
        jobs.insert(
            "new".to_string(),
            terminal_record("new", "2026-06-05T00:00:01Z", 900),
        );

        prune_terminal_jobs(&mut jobs);

        assert!(!jobs.contains_key("old"));
        assert!(jobs.contains_key("new"));
        assert_eq!(jobs.len(), 1);
    }

    fn terminal_record(job_id: &str, updated_at_utc: &str, body_len: usize) -> JobRecord {
        JobRecord {
            summary: CurlJobSummary {
                job_id: job_id.to_string(),
                status: CurlJobStatus::Succeeded,
                total_requests: 1,
                completed_requests: 1,
                failed_requests: 0,
                canceled_requests: 0,
                created_at_utc: "2026-06-05T00:00:00Z".to_string(),
                updated_at_utc: updated_at_utc.to_string(),
            },
            results: vec![CurlJobResult {
                index: 0,
                status: CurlJobStatus::Succeeded,
                input_value: None,
                request_preview: None,
                response: Some(CurlHttpResponse {
                    status: 200,
                    status_text: None,
                    headers: Vec::new(),
                    body: "x".repeat(body_len),
                    body_truncated: false,
                    elapsed_ms: 1,
                    response_bytes: body_len,
                }),
                error: None,
            }],
            cancel_requested: Arc::new(AtomicBool::new(false)),
            worker_active: false,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::format_unix_seconds_utc;

    #[test]
    fn formats_unix_seconds_as_utc_rfc3339() {
        assert_eq!(format_unix_seconds_utc(0), "1970-01-01T00:00:00Z");
        assert_eq!(
            format_unix_seconds_utc(1_801_680_000),
            "2027-02-03T18:40:00Z"
        );
    }
}
