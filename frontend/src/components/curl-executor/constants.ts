import type { CurlLimitsConfig, FeatureFlagsConfig } from '../../lib/commands'

export const SAMPLE_CURL = `curl -X GET 'https://api.example.com/items/550e8400-e29b-41d4-a716-446655440000' \\
  -H 'Authorization: Bearer example-token' \\
  -H 'Accept: application/json'`

export const SAMPLE_BATCH_VALUES = `2f4c1f5a-1b7a-4a6d-8d76-4f5d4f2c8a91
7c9e6679-7425-40de-944b-e07fc1f90ae7`

export const DEFAULT_BATCH_PLACEHOLDER = '{value}'

export const DEFAULT_CURL_LIMITS: CurlLimitsConfig = {
  enabled: true,
  default_timeout_ms: 30_000,
  max_timeout_ms: 120_000,
  max_response_bytes: 1_048_576,
  max_batch_size: 100,
  default_max_concurrency: 5,
  max_concurrency: 10,
  large_batch_confirmation_threshold: 20,
  allow_private_networks_by_default: true,
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
