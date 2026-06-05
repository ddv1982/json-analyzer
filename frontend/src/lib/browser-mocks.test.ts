import { describe, expect, it } from 'vitest'
import { browserMockInvoke } from './browser-mocks'
import type {
  AdvancedFieldDuplicatesResponse,
  AnalysisResponse,
  CompositeDuplicatesResponse,
  ConfigResponse,
  CurlExecuteResponse,
  CurlGuardrailResponse,
  CurlJobResponse,
  CurlJobResultsResponse,
  CurlParseResponse,
  ValuesAnalysisResponse,
  ValuesExplorerAnalysisResponse,
  ValuesFieldDiscoveryResponse,
} from './commands'
import { sampleJsonInput } from './sample-data'

describe('browser mock command contracts', () => {
  it('browser mocks follow Rust serde defaults and target compact duplicate keys', async () => {
    const analysis = await browserMockInvoke<AnalysisResponse>('analyze_json', {
      request: { json_string: sampleJsonInput },
    })

    expect(analysis.min_max_filled.has_records).toBe(true)
    expect(analysis.exact_duplicates.duplicates[0].value).toBe('{"id":1,"name":"Alice"}')
  })

  it('browser mocks expose format_json without collapsing obvious duplicate keys', async () => {
    const formatted = await browserMockInvoke<{ formatted_json: string }>('format_json', {
      request: { json_string: '{"id":1,"id":2}' },
    })

    expect(formatted.formatted_json).toBe('{"id":1,"id":2}')
  })

  it('browser mocks expose expanded config defaults and deferred feature flags', async () => {
    const config = await browserMockInvoke<ConfigResponse>('get_config')

    expect(config.config).toMatchObject({
      limits: {
        max_json_bytes: 16 * 1024 * 1024,
        max_json_depth: 512,
        values_explorer: {
          max_selected_fields: 5,
          default_page_size: 25,
          page_sizes: [10, 25, 50, 100],
          max_page_size: 100,
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
        },
      },
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
    })
  })

  it('browser mocks expose fixture-backed Values Explorer commands', async () => {
    const fields = await browserMockInvoke<ValuesFieldDiscoveryResponse>('discover_values_fields', {
      request: { json_string: sampleJsonInput, search: 'dep', limit: 10 },
    })
    const values = await browserMockInvoke<ValuesAnalysisResponse>('analyze_values', {
      request: {
        json_string: sampleJsonInput,
        selected_fields: ['[].department'],
        search: null,
        sort: { by: 'count', direction: 'desc' },
        page: 1,
        page_size: 2,
        include_parent_items: true,
      },
    })

    expect(fields).toMatchObject({
      fields: [{ field_path: '[].department', unique_value_count: 3 }],
    })
    expect(values).toMatchObject({
      selected_fields: ['[].department'],
      total_groups: 3,
    })
    expect(values.groups[0]).toMatchObject({
      display_value: 'Engineering',
      count: 4,
      record_indexes: [0, 1, 3, 4],
    })
  })

  it('browser mocks validate Values Explorer requests like the Rust service', async () => {
    await expect(
      browserMockInvoke('discover_values_fields', {
        request: { json_string: sampleJsonInput, search: null, limit: 0 },
      }),
    ).rejects.toMatchObject({
      error_type: 'invalid_request',
      detail: 'limit must be greater than or equal to 1 when provided',
    })

    await expect(
      browserMockInvoke('analyze_values', {
        request: {
          json_string: sampleJsonInput,
          selected_fields: ['   '],
          search: null,
          sort: { by: 'count', direction: 'desc' },
          page: 1,
          page_size: 25,
          include_parent_items: false,
        },
      }),
    ).rejects.toMatchObject({
      error_type: 'invalid_request',
      detail: 'selected_fields cannot contain empty fields',
    })

    await expect(
      browserMockInvoke('analyze_values', {
        request: {
          json_string: sampleJsonInput,
          selected_fields: [' [].department ', '[].department'],
          search: null,
          sort: { by: 'count', direction: 'desc' },
          page: 1,
          page_size: 25,
          include_parent_items: false,
        },
      }),
    ).rejects.toMatchObject({
      error_type: 'invalid_request',
      detail: 'selected_fields must contain unique fields',
    })
  })

  it('browser mocks paginate Values Explorer groups from request page and page size', async () => {
    const values = await browserMockInvoke<ValuesAnalysisResponse>('analyze_values', {
      request: {
        json_string: sampleJsonInput,
        selected_fields: ['[].department'],
        search: null,
        sort: { by: 'count', direction: 'desc' },
        page: 2,
        page_size: 1,
        include_parent_items: false,
      },
    })

    expect(values).toMatchObject({
      selected_fields: ['[].department'],
      total_groups: 3,
      page: 2,
      page_size: 1,
      has_next_page: true,
    })
    expect(values.groups).toHaveLength(1)
    expect(values.groups[0]).toMatchObject({
      display_value: 'Design',
      count: 2,
      source_paths: ['2.department', '7.department'],
      parent_items: [],
    })
  })

  it('browser mocks apply Values Explorer value search and sort requests', async () => {
    const values = await browserMockInvoke<ValuesAnalysisResponse>('analyze_values', {
      request: {
        json_string: sampleJsonInput,
        selected_fields: ['[].department'],
        search: 'sup',
        sort: { by: 'value', direction: 'asc' },
        page: 1,
        page_size: 10,
        include_parent_items: false,
      },
    })

    expect(values.total_groups).toBe(1)
    expect(values.groups[0]).toMatchObject({
      display_value: 'Support',
      count: 2,
      source_paths: ['5.department', '6.department'],
    })
  })

  it('browser mocks expose the target Values Explorer endpoint with independent result pagination', async () => {
    const values = await browserMockInvoke<ValuesExplorerAnalysisResponse>('analyze_values_explorer', {
      request: {
        json_string: sampleJsonInput,
        selected_fields: ['[].department'],
        filter: null,
        sort_mode: 'frequency',
        page: 1,
        groups_page: 2,
        page_size: 1,
      },
    })

    expect(values).toMatchObject({
      field_paths: ['[].department'],
      total_items: 8,
      unique_values: 3,
      duplicate_group_count: 3,
      page: 1,
      groups_page: 2,
      total_pages: 3,
      groups_total_pages: 3,
    })
    expect(values.duplicates[0]).toMatchObject({
      display_value: 'Engineering',
      count: 4,
      is_duplicate: true,
    })
    expect(values.all_field_values[0]).toMatchObject({
      display_value: 'Design',
      count: 2,
    })
  })

  it('browser mocks apply target Values Explorer field filters to parent records', async () => {
    const values = await browserMockInvoke<ValuesExplorerAnalysisResponse>('analyze_values_explorer', {
      request: {
        json_string: sampleJsonInput,
        selected_fields: ['[].department'],
        filter: {
          field_path: '[].status',
          value: 'active',
          match_mode: 'exact',
          case_sensitive: false,
        },
        sort_mode: 'frequency',
        page: 1,
        groups_page: 1,
        page_size: 10,
      },
    })

    expect(values).toMatchObject({
      total_items: 6,
      unique_values: 3,
      duplicate_group_count: 2,
      has_duplicates: true,
    })
    expect(values.duplicates.map((group) => [group.display_value, group.count])).toEqual([
      ['Engineering', 3],
      ['Design', 2],
    ])
    expect(values.all_field_values.find((group) => group.display_value === 'Support')).toMatchObject({
      count: 1,
      is_duplicate: false,
    })
  })

  it('browser mocks validate target Values Explorer groups_page requests like the Rust service', async () => {
    await expect(
      browserMockInvoke('analyze_values_explorer', {
        request: {
          json_string: sampleJsonInput,
          selected_fields: ['[].department'],
          filter: null,
          sort_mode: 'frequency',
          page: 1,
          groups_page: 0,
          page_size: 25,
        },
      }),
    ).rejects.toMatchObject({
      error_type: 'invalid_request',
      detail: 'groups_page must be greater than or equal to 1',
    })
  })

  it('browser mocks expose advanced field duplicate analysis with filters and parent items', async () => {
    const duplicates = await browserMockInvoke<AdvancedFieldDuplicatesResponse>('analyze_advanced_field_duplicates', {
      request: {
        json_string: sampleJsonInput,
        field_path: '[].department',
        filter: { field_path: '[].status', value: 'active' },
        case_sensitive: true,
        include_parent_items: true,
        page: 1,
        page_size: 10,
      },
    })

    expect(duplicates).toMatchObject({
      field_path: '[].department',
      duplicate_group_count: 2,
    })
    expect(duplicates.duplicates[0]).toMatchObject({
      display_value: 'Engineering',
      count: 3,
      record_indexes: [0, 1, 4],
    })
    expect(duplicates.duplicates[0].parent_items[0]).toMatchObject({ record_index: 0 })
    expect(duplicates.all_values_summary).toEqual(
      expect.arrayContaining([expect.objectContaining({ display_value: 'Support', count: 1, is_duplicate: false })]),
    )
  })

  it('browser mocks expose curl parse preview, guardrail validation, and execution', async () => {
    const parsed = await browserMockInvoke<CurlParseResponse>('parse_curl', {
      request: {
        curl: "curl -X POST -H 'Authorization: Bearer secret' -H 'X-Auth-Token: secret-token' -H 'Api-Key: secret-key' -H 'Content-Type: application/json' --data '{\"ok\":true}' https://api.example.com/users",
      },
    })
    const guardrail = await browserMockInvoke<CurlGuardrailResponse>('validate_curl_guardrail', {
      request: { method: parsed.parsed.method, url: parsed.parsed.url, redirect_target: null },
    })
    const executed = await browserMockInvoke<CurlExecuteResponse>('execute_curl', {
      request: {
        curl: "curl -H 'Authorization: Bearer secret-token' https://api.example.com/users",
        timeout_ms: 30_000,
        follow_redirects: true,
      },
    })

    expect(parsed.parsed).toMatchObject({
      method: 'POST',
      url: 'https://api.example.com/users',
      body: '{"ok":true}',
      body_kind: 'json_string',
      auth: { bearer_token_present: true, scheme: 'Bearer' },
    })
    expect(parsed.parsed.headers[0]).toMatchObject({ name: 'Authorization', value: 'Bearer ***', redacted: true })
    expect(parsed.parsed.headers[1]).toMatchObject({ name: 'X-Auth-Token', value: '***', redacted: true })
    expect(parsed.parsed.headers[2]).toMatchObject({ name: 'Api-Key', value: '***', redacted: true })
    expect(guardrail.decision).toMatchObject({ allowed: true, reason: 'public_https_url' })
    expect(executed.response).toMatchObject({
      status: 200,
      body: '{"ok":true}',
      headers: expect.arrayContaining([{ name: 'Set-Cookie', value: '***', redacted: true }]),
    })
    expect(executed.request_preview.headers[0]).toMatchObject({ value: 'Bearer ***', redacted: true })
  })

  it('browser mocks expose curl async job polling, batch aggregation, and cancel', async () => {
    const started = await browserMockInvoke<CurlJobResponse>('start_curl_job', {
      request: {
        curls: [
          'curl https://api.example.com/users/1',
          'curl http://localhost/admin',
        ],
        timeout_ms: null,
        follow_redirects: true,
        confirm_large_batch: false,
      },
    })
    const polled = await browserMockInvoke<CurlJobResultsResponse>('get_curl_job_results', {
      request: { job_id: started.job.job_id },
    })

    expect(polled.job).toMatchObject({
      status: 'failed',
      total_requests: 2,
      completed_requests: 1,
      failed_requests: 1,
      canceled_requests: 0,
    })
    expect(polled.results[0]).toMatchObject({ status: 'succeeded', response: { status: 200 } })
    expect(polled.results[1]).toMatchObject({
      status: 'failed',
      error: { error_type: 'curl_guardrail_denied' },
    })

    const cancelStarted = await browserMockInvoke<CurlJobResponse>('start_curl_job', {
      request: {
        curls: ['curl https://api.example.com/users/3'],
        timeout_ms: null,
        follow_redirects: true,
        confirm_large_batch: false,
      },
    })
    const canceled = await browserMockInvoke<CurlJobResponse>('cancel_curl_job', {
      request: { job_id: cancelStarted.job.job_id },
    })
    expect(canceled.job.status).toBe('canceled')
  })

  it('browser mocks reject invalid curl guardrail methods and empty redirect targets', async () => {
    await expect(
      browserMockInvoke('validate_curl_guardrail', {
        request: { method: 'BAD METHOD', url: 'https://api.example.com/users', redirect_target: null },
      }),
    ).rejects.toMatchObject({
      error_type: 'invalid_request',
      status: 400,
      detail: 'curl guardrail method is invalid',
    })

    await expect(
      browserMockInvoke('validate_curl_guardrail', {
        request: { method: 'GET', url: 'https://api.example.com/users', redirect_target: '   ' },
      }),
    ).rejects.toMatchObject({
      error_type: 'invalid_request',
      status: 400,
      detail: 'curl guardrail redirect target cannot be empty',
    })
  })

  it('browser mocks block localhost curl guardrail previews with trailing-dot normalization', async () => {
    const guardrail = await browserMockInvoke<CurlGuardrailResponse>('validate_curl_guardrail', {
      request: { method: 'GET', url: 'http://localhost./admin', redirect_target: null },
    })

    expect(guardrail.decision).toMatchObject({
      allowed: false,
      reason: 'localhost_targets_are_blocked_by_default',
      error_type: 'curl_guardrail_denied',
    })
  })

  it('browser mocks block private and special curl redirect targets', async () => {
    const guardrail = await browserMockInvoke<CurlGuardrailResponse>('validate_curl_guardrail', {
      request: {
        method: 'GET',
        url: 'https://api.example.com/users',
        redirect_target: 'http://169.254.169.254/latest/meta-data',
      },
    })

    expect(guardrail.decision).toMatchObject({
      allowed: false,
      reason: 'private_network_targets_are_blocked_by_default',
      error_type: 'curl_guardrail_denied',
    })
  })

  it.each([
    'http://10.0.0.1/',
    'http://100.64.0.1/',
    'http://169.254.169.254/',
    'http://172.16.0.1/',
    'http://192.0.2.10/',
    'http://198.51.100.10/',
    'http://203.0.113.10/',
    'http://224.0.0.1/',
    'http://[::1]/',
    'http://[fc00::1]/',
    'http://[fe80::1]/',
    'http://[2001:db8::1]/',
    'http://[ff02::1]/',
    'http://[::ffff:192.168.0.1]/',
  ])('browser mocks block representative private and special curl target %s', async (url) => {
    const guardrail = await browserMockInvoke<CurlGuardrailResponse>('validate_curl_guardrail', {
      request: { method: 'GET', url, redirect_target: null },
    })

    expect(guardrail.decision).toMatchObject({
      allowed: false,
      reason: 'private_network_targets_are_blocked_by_default',
      error_type: 'curl_guardrail_denied',
    })
  })

  it('browser mocks still allow public curl targets by default', async () => {
    const guardrail = await browserMockInvoke<CurlGuardrailResponse>('validate_curl_guardrail', {
      request: { method: 'GET', url: 'http://93.184.216.34/', redirect_target: null },
    })

    expect(guardrail.decision).toMatchObject({ allowed: true, reason: 'public_http_url', error_type: null })
  })

  it('browser mocks map unsupported curl file upload options to HTTP 400 problem details', async () => {
    await expect(
      browserMockInvoke('parse_curl', {
        request: { curl: 'curl -F file=@fixture.json https://api.example.com/upload' },
      }),
    ).rejects.toMatchObject({
      error_type: 'unsupported_file_upload_option',
      status: 400,
    })
  })

  it('browser mocks expose composite duplicate analysis and no-result cases', async () => {
    const composite = await browserMockInvoke<CompositeDuplicatesResponse>('analyze_composite_duplicates', {
      request: {
        json_string: sampleJsonInput,
        field_paths: ['[].department', '[].role'],
        filter: null,
        case_sensitive: true,
        include_parent_items: false,
        page: 1,
        page_size: 10,
      },
    })
    const noResults = await browserMockInvoke<AdvancedFieldDuplicatesResponse>('analyze_advanced_field_duplicates', {
      request: {
        json_string: sampleJsonInput,
        field_path: '[].name',
        filter: null,
        case_sensitive: true,
        include_parent_items: false,
        page: 1,
        page_size: 10,
      },
    })

    expect(composite.duplicate_group_count).toBe(3)
    expect(composite.duplicates[0]).toMatchObject({
      key: ['Engineering', 'Developer'],
      count: 3,
      record_indexes: [0, 1, 4],
    })
    expect(noResults.duplicate_group_count).toBe(0)
    expect(noResults.duplicates).toEqual([])
  })

  it('browser mocks apply the pinned one-level root list-of-lists flatten option', async () => {
    const jsonString = '[[{"id":1}],[],[{"id":2},{"id":3}]]'

    const nested = await browserMockInvoke<AnalysisResponse>('analyze_json', {
      request: { json_string: jsonString, flatten: false },
    })
    const flattened = await browserMockInvoke<AnalysisResponse>('analyze_json', {
      request: { json_string: jsonString, flatten: true },
    })

    expect(nested.structure.container_summary.is_list_of_lists).toBe(true)
    expect(nested.structure.container_summary.flattened_one_level_items).toBe(3)
    expect(flattened.structure.container_summary.is_list_of_lists).toBe(false)
    expect(flattened.structure.size).toBe(3)
  })

  it('browser mocks reject concatenated roots like the strict service path', async () => {
    await expect(
      browserMockInvoke('validate_json', {
        request: { json_string: '{"id":1}\n{"id":2}' },
      }),
    ).rejects.toMatchObject({
      error_type: 'json_parse_error',
      status: 400,
      position: { offset: 9, line: 2, column: 1 },
    })
  })

})
