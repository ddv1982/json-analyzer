use std::sync::{Arc, Condvar, Mutex};
use std::time::{Duration, Instant};

use json_analyzer::*;

pub(crate) const PARITY_CONTRACTS: &str =
    include_str!("../fixtures/golden/full-source-parity-contracts.json");

pub(crate) fn wait_for_job_results(
    manager: &CurlJobManager,
    job_id: &str,
) -> CurlJobResultsResponse {
    let deadline = Instant::now() + Duration::from_secs(2);
    loop {
        let results = manager
            .get_job_results(CurlJobRequest {
                job_id: job_id.to_string(),
            })
            .unwrap();
        if matches!(
            results.job.status,
            CurlJobStatus::Succeeded | CurlJobStatus::Failed | CurlJobStatus::Canceled
        ) {
            return results;
        }
        assert!(Instant::now() < deadline, "curl job did not finish in time");
        std::thread::sleep(Duration::from_millis(10));
    }
}

pub(crate) fn wait_for_job_status(manager: &CurlJobManager, job_id: &str, status: CurlJobStatus) {
    let deadline = Instant::now() + Duration::from_secs(2);
    loop {
        let results = manager
            .get_job_results(CurlJobRequest {
                job_id: job_id.to_string(),
            })
            .unwrap();
        if results.job.status == status
            || results.results.iter().any(|result| result.status == status)
        {
            return;
        }
        assert!(
            Instant::now() < deadline,
            "curl job did not reach {status:?}"
        );
        std::thread::sleep(Duration::from_millis(10));
    }
}

#[derive(Debug)]
pub(crate) struct SequenceCurlClient {
    results: Mutex<Vec<Result<CurlHttpClientResponse, CurlHttpClientError>>>,
    seen: Mutex<Vec<CurlHttpRequest>>,
}

impl SequenceCurlClient {
    pub(crate) fn new(results: Vec<Result<CurlHttpClientResponse, CurlHttpClientError>>) -> Self {
        Self {
            results: Mutex::new(results),
            seen: Mutex::new(Vec::new()),
        }
    }

    pub(crate) fn seen_requests(&self) -> Vec<CurlHttpRequest> {
        self.seen.lock().unwrap().clone()
    }
}

impl CurlHttpClient for SequenceCurlClient {
    fn send(
        &self,
        request: CurlHttpRequest,
        _timeout: Duration,
        _max_response_bytes: usize,
    ) -> Result<CurlHttpClientResponse, CurlHttpClientError> {
        self.seen.lock().unwrap().push(request);
        let mut results = self.results.lock().unwrap();
        if results.is_empty() {
            return Err(CurlHttpClientError::Network(
                "mock response exhausted".to_string(),
            ));
        }
        results.remove(0)
    }
}

#[derive(Debug)]
pub(crate) struct RecordingCurlClient {
    result: Mutex<Result<CurlHttpClientResponse, CurlHttpClientError>>,
    seen: Mutex<Vec<CurlHttpRequest>>,
}

impl RecordingCurlClient {
    pub(crate) fn new(result: Result<CurlHttpClientResponse, CurlHttpClientError>) -> Self {
        Self {
            result: Mutex::new(result),
            seen: Mutex::new(Vec::new()),
        }
    }

    pub(crate) fn seen_requests(&self) -> Vec<CurlHttpRequest> {
        self.seen.lock().unwrap().clone()
    }
}

impl CurlHttpClient for RecordingCurlClient {
    fn send(
        &self,
        request: CurlHttpRequest,
        _timeout: Duration,
        _max_response_bytes: usize,
    ) -> Result<CurlHttpClientResponse, CurlHttpClientError> {
        self.seen.lock().unwrap().push(request);
        self.result.lock().unwrap().clone()
    }
}

#[derive(Debug, Clone)]
pub(crate) struct BlockingCurlClient {
    state: Arc<(Mutex<BlockingCurlClientState>, Condvar)>,
}

#[derive(Debug, Default)]
struct BlockingCurlClientState {
    started_requests: usize,
    released: bool,
}

impl BlockingCurlClient {
    pub(crate) fn new() -> Self {
        Self {
            state: Arc::new((
                Mutex::new(BlockingCurlClientState::default()),
                Condvar::new(),
            )),
        }
    }

    pub(crate) fn wait_for_started_requests(&self, expected: usize) {
        let deadline = Instant::now() + Duration::from_secs(5);
        let (lock, cvar) = &*self.state;
        let mut state = lock.lock().unwrap();
        while state.started_requests < expected {
            assert!(
                Instant::now() < deadline,
                "blocking curl client saw {} requests, expected {expected}",
                state.started_requests
            );
            let remaining = deadline.saturating_duration_since(Instant::now());
            let (next_state, _timeout) = cvar.wait_timeout(state, remaining).unwrap();
            state = next_state;
        }
    }

    pub(crate) fn release_all(&self) {
        let (lock, cvar) = &*self.state;
        let mut state = lock.lock().unwrap();
        state.released = true;
        cvar.notify_all();
    }
}

impl CurlHttpClient for BlockingCurlClient {
    fn send(
        &self,
        _request: CurlHttpRequest,
        _timeout: Duration,
        _max_response_bytes: usize,
    ) -> Result<CurlHttpClientResponse, CurlHttpClientError> {
        let (lock, cvar) = &*self.state;
        let mut state = lock.lock().unwrap();
        state.started_requests += 1;
        cvar.notify_all();
        while !state.released {
            state = cvar.wait(state).unwrap();
        }
        Ok(mock_response(200, b"done"))
    }
}

#[derive(Debug)]
pub(crate) struct SleepCurlClient {
    pub(crate) sleep_for: Duration,
}

impl CurlHttpClient for SleepCurlClient {
    fn send(
        &self,
        _request: CurlHttpRequest,
        _timeout: Duration,
        _max_response_bytes: usize,
    ) -> Result<CurlHttpClientResponse, CurlHttpClientError> {
        std::thread::sleep(self.sleep_for);
        Ok(mock_response(200, b"done"))
    }
}

pub(crate) fn mock_response(status: u16, body: &[u8]) -> CurlHttpClientResponse {
    CurlHttpClientResponse {
        status,
        status_text: None,
        headers: Vec::new(),
        body: body.to_vec(),
        body_truncated: false,
        response_bytes: body.len(),
    }
}
