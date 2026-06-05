use std::sync::Arc;
use std::time::Duration;

use json_analyzer::*;

use crate::support::{
    BlockingCurlClient, RecordingCurlClient, SequenceCurlClient, SleepCurlClient, mock_response,
    wait_for_job_results, wait_for_job_status,
};

const TEST_MAX_ACTIVE_JOBS: usize = 8;

#[test]
fn curl_job_manager_redacts_network_error_details_before_storage() {
    let manager = CurlJobManager::new();
    let client = Arc::new(RecordingCurlClient::new(Err(CurlHttpClientError::Network(
        "request failed for http://user:password@93.184.216.34/items?secret=hidden&id=1"
            .to_string(),
    ))));
    let started = manager
        .start_job_with_client(
            CurlStartJobRequest {
                curls: vec![
                    "curl 'http://user:password@93.184.216.34/items?secret=hidden&id=1'"
                        .to_string(),
                ],
                timeout_ms: Some(50),
                follow_redirects: false,
                confirm_large_batch: false,
            },
            CurlLimitsConfig::default(),
            client,
        )
        .unwrap();

    let results = wait_for_job_results(&manager, &started.job.job_id);
    let detail = &results.results[0].error.as_ref().unwrap().detail;
    assert!(detail.contains("http://93.184.216.34/items?secret=***&id=1"));
    assert!(!detail.contains("user:password"));
    assert!(!detail.contains("secret=hidden"));
}

fn wait_until_job_can_start(manager: &CurlJobManager) -> String {
    let deadline = std::time::Instant::now() + Duration::from_secs(2);
    loop {
        match manager.start_job_with_client(
            CurlStartJobRequest {
                curls: vec!["curl http://93.184.216.34/replacement".to_string()],
                timeout_ms: Some(1_000),
                follow_redirects: false,
                confirm_large_batch: false,
            },
            CurlLimitsConfig::default(),
            Arc::new(RecordingCurlClient::new(Ok(mock_response(
                200,
                b"replacement",
            )))),
        ) {
            Ok(started) => return started.job.job_id,
            Err(error) => {
                assert!(
                    std::time::Instant::now() < deadline,
                    "curl job capacity did not return after releasing workers: {error:?}"
                );
                std::thread::sleep(Duration::from_millis(10));
            }
        }
    }
}

#[test]
fn curl_job_manager_executes_batch_and_aggregates_results_with_mocked_client() {
    let manager = CurlJobManager::new();
    let client = Arc::new(SequenceCurlClient::new(vec![
        Ok(mock_response(200, b"one")),
        Err(CurlHttpClientError::Timeout),
    ]));
    let started = manager
        .start_job_with_client(
            CurlStartJobRequest {
                curls: vec![
                    "curl http://93.184.216.34/one".to_string(),
                    "curl http://93.184.216.34/two".to_string(),
                ],
                timeout_ms: Some(50),
                follow_redirects: false,
                confirm_large_batch: false,
            },
            CurlLimitsConfig::default(),
            client,
        )
        .unwrap();

    let results = wait_for_job_results(&manager, &started.job.job_id);
    assert_eq!(results.job.status, CurlJobStatus::Failed);
    assert_eq!(results.job.total_requests, 2);
    assert_eq!(results.job.completed_requests, 1);
    assert_eq!(results.job.failed_requests, 1);
    assert_eq!(results.job.canceled_requests, 0);
    assert_eq!(results.results[0].status, CurlJobStatus::Succeeded);
    assert_eq!(results.results[0].response.as_ref().unwrap().body, "one");
    assert_eq!(results.results[1].status, CurlJobStatus::Failed);
    assert_eq!(
        results.results[1].error.as_ref().unwrap().error_type,
        "curl_timeout"
    );
}
#[test]
fn curl_job_manager_rejects_invalid_timeout_before_enqueueing() {
    let manager = CurlJobManager::new();
    let client = Arc::new(RecordingCurlClient::new(Ok(mock_response(200, b"ok"))));

    let error = manager
        .start_job_with_client(
            CurlStartJobRequest {
                curls: vec!["curl http://93.184.216.34/one".to_string()],
                timeout_ms: Some(0),
                follow_redirects: false,
                confirm_large_batch: false,
            },
            CurlLimitsConfig::default(),
            client.clone(),
        )
        .unwrap_err();

    assert_eq!(error.problem.error_type, "invalid_request");
    assert_eq!(error.problem.invalid_params[0].name, "timeout_ms");
    assert!(client.seen_requests().is_empty());
}
#[test]
fn curl_job_manager_requires_large_batch_confirmation_and_enforces_batch_limit() {
    let manager = CurlJobManager::new();
    let limits = CurlLimitsConfig {
        max_batch_size: 3,
        large_batch_confirmation_threshold: 2,
        ..CurlLimitsConfig::default()
    };
    let client = Arc::new(RecordingCurlClient::new(Ok(mock_response(200, b"ok"))));

    let unconfirmed = manager
        .start_job_with_client(
            CurlStartJobRequest {
                curls: vec![
                    "curl http://93.184.216.34/one".to_string(),
                    "curl http://93.184.216.34/two".to_string(),
                ],
                timeout_ms: Some(50),
                follow_redirects: false,
                confirm_large_batch: false,
            },
            limits.clone(),
            client.clone(),
        )
        .unwrap_err();
    assert_eq!(
        unconfirmed.problem.invalid_params[0].name,
        "confirm_large_batch"
    );

    let too_large = manager
        .start_job_with_client(
            CurlStartJobRequest {
                curls: vec![
                    "curl http://93.184.216.34/one".to_string(),
                    "curl http://93.184.216.34/two".to_string(),
                    "curl http://93.184.216.34/three".to_string(),
                    "curl http://93.184.216.34/four".to_string(),
                ],
                timeout_ms: Some(50),
                follow_redirects: false,
                confirm_large_batch: true,
            },
            limits,
            client,
        )
        .unwrap_err();
    assert_eq!(too_large.problem.invalid_params[0].name, "curls");
}
#[test]
fn canceled_running_curl_jobs_keep_active_slots_until_workers_exit() {
    let manager = CurlJobManager::new();
    let blocking_client = Arc::new(BlockingCurlClient::new());
    let mut job_ids = Vec::new();

    for index in 0..TEST_MAX_ACTIVE_JOBS {
        let started = manager
            .start_job_with_client(
                CurlStartJobRequest {
                    curls: vec![format!("curl http://93.184.216.34/blocking-{index}")],
                    timeout_ms: Some(1_000),
                    follow_redirects: false,
                    confirm_large_batch: false,
                },
                CurlLimitsConfig::default(),
                blocking_client.clone(),
            )
            .unwrap();
        job_ids.push(started.job.job_id);
    }
    blocking_client.wait_for_started_requests(TEST_MAX_ACTIVE_JOBS);

    for job_id in &job_ids {
        let canceled = manager
            .cancel_job(CurlJobRequest {
                job_id: job_id.clone(),
            })
            .unwrap();
        assert_eq!(canceled.job.status, CurlJobStatus::Canceled);
    }

    let rejected_while_workers_blocked = manager
        .start_job_with_client(
            CurlStartJobRequest {
                curls: vec!["curl http://93.184.216.34/rejected".to_string()],
                timeout_ms: Some(1_000),
                follow_redirects: false,
                confirm_large_batch: false,
            },
            CurlLimitsConfig::default(),
            Arc::new(RecordingCurlClient::new(Ok(mock_response(200, b"late")))),
        )
        .unwrap_err();
    assert_eq!(
        rejected_while_workers_blocked.problem.invalid_params[0].reason,
        "too many active curl jobs (max 8)"
    );

    blocking_client.release_all();
    let replacement_job_id = wait_until_job_can_start(&manager);
    let replacement_results = wait_for_job_results(&manager, &replacement_job_id);
    assert_eq!(replacement_results.job.status, CurlJobStatus::Succeeded);
}

#[test]
fn canceling_curl_job_leaves_terminal_canceled_state() {
    let manager = CurlJobManager::new();
    let client = Arc::new(SleepCurlClient {
        sleep_for: Duration::from_millis(120),
    });
    let started = manager
        .start_job_with_client(
            CurlStartJobRequest {
                curls: vec![
                    "curl http://93.184.216.34/slow".to_string(),
                    "curl http://93.184.216.34/queued".to_string(),
                ],
                timeout_ms: Some(1_000),
                follow_redirects: false,
                confirm_large_batch: false,
            },
            CurlLimitsConfig::default(),
            client,
        )
        .unwrap();

    wait_for_job_status(&manager, &started.job.job_id, CurlJobStatus::Running);
    let canceled = manager
        .cancel_job(CurlJobRequest {
            job_id: started.job.job_id.clone(),
        })
        .unwrap();
    assert_eq!(canceled.job.status, CurlJobStatus::Canceled);

    std::thread::sleep(Duration::from_millis(180));
    let results = manager
        .get_job_results(CurlJobRequest {
            job_id: started.job.job_id,
        })
        .unwrap();
    assert_eq!(results.job.status, CurlJobStatus::Canceled);
    assert_eq!(results.job.canceled_requests, 2);
    assert!(
        results
            .results
            .iter()
            .all(|result| result.status == CurlJobStatus::Canceled)
    );
}
