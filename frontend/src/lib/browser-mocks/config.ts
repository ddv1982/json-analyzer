import type { ConfigResponse } from '../commands'

export function mockConfig(): ConfigResponse['config'] {
  return {
    limits: {
      max_json_bytes: 16 * 1024 * 1024,
      max_json_depth: 512,
      values_explorer: {
        max_selected_fields: 5,
        default_page_size: 25,
        page_sizes: [10, 25, 50, 100],
        max_page_size: 100,
        max_parent_items_per_group: 100,
        max_match_combinations_per_record: 10_000,
        max_match_combinations_per_request: 100_000,
      },
      duplicates: {
        composite_min_fields: 2,
        composite_max_fields: 5,
        default_page_size: 25,
        max_page_size: 100,
        max_match_combinations_per_record: 10_000,
        max_match_combinations_per_request: 100_000,
      },
      curl: {
        enabled: true,
        default_timeout_ms: 30_000,
        max_timeout_ms: 120_000,
        max_response_bytes: 1_048_576,
        max_batch_size: 100,
        large_batch_confirmation_threshold: 20,
        allow_private_networks_by_default: false,
      },
    },
    validation: { schema_json: null, schema_path: null, enforcement: 'disabled' },
    features: {
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
    },
  }
}
