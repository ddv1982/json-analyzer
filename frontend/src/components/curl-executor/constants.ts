import type { CurlLimitsConfig, FeatureFlagsConfig } from '../../lib/commands'

export const SAMPLE_CURL = `curl -X POST https://api.example.com/users \\
  -H 'Authorization: Bearer example-token' \\
  -H 'Content-Type: application/json' \\
  --data '{"name":"Alice"}'`

export const SAMPLE_BATCH = `curl https://api.example.com/users/1
curl https://api.example.com/users/2`

export const DEFAULT_CURL_LIMITS: CurlLimitsConfig = {
  enabled: true,
  default_timeout_ms: 30_000,
  max_timeout_ms: 120_000,
  max_response_bytes: 1_048_576,
  max_batch_size: 100,
  large_batch_confirmation_threshold: 20,
  allow_private_networks_by_default: false,
}

export const DEFAULT_CURL_FEATURES: FeatureFlagsConfig = {
  values_explorer: true,
  advanced_duplicates: true,
  pdf_export: false,
  curl_executor: true,
  curl_single_request_execution: true,
  curl_jobs: true,
  curl_batch: true,
  curl_cancel: true,
  metrics_ui: false,
  http_openapi_adapter: false,
  sqlite_curl_jobs: false,
}
