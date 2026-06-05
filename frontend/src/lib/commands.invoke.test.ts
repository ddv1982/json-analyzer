import { invoke } from '@tauri-apps/api/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  COMMANDS,
  HEALTH_COMMAND,
  analyzeAdvancedFieldDuplicates,
  analyzeCompositeDuplicates,
  analyzeJson,
  analyzeValues,
  discoverValuesFields,
  cancelCurlJob,
  executeCurl,
  findDuplicates,
  getCurlJobResults,
  formatJson,
  getConfig,
  getFields,
  getHealth,
  minMaxFilled,
  normalizeCommandError,
  parseCurl,
  startCurlJob,
  validateCurlGuardrail,
  validateJson,
} from './commands'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

const invokeMock = vi.mocked(invoke)

describe('Tauri command wrappers', () => {
  beforeEach(() => {
    invokeMock.mockReset()
  })

  it('exposes the required Phase 5 command names', () => {
    expect(HEALTH_COMMAND).toBe('get_health')
    expect(Object.values(COMMANDS)).toEqual([
      'validate_json',
      'format_json',
      'analyze_json',
      'get_fields',
      'find_duplicates',
      'min_max_filled',
      'discover_values_fields',
      'analyze_values',
      'analyze_advanced_field_duplicates',
      'analyze_composite_duplicates',
      'parse_curl',
      'validate_curl_guardrail',
      'execute_curl',
      'start_curl_job',
      'get_curl_job_results',
      'cancel_curl_job',
      'get_config',
      'get_health',
    ])
  })

  it('passes typed request payloads under the Tauri request argument', async () => {
    invokeMock.mockResolvedValue({ ok: true })

    await validateJson({ json_string: '{}' })
    await formatJson({ json_string: '{"id":1,"id":2}' })
    await analyzeJson({ json_string: '{}', min_max_deep: false, flatten: true })
    await getFields({ json_string: '{}' })
    await findDuplicates({ json_string: '[]', field_path: null, case_sensitive: true })
    await minMaxFilled({ json_string: '[]', deep: true })
    await discoverValuesFields({ json_string: '[]', search: 'dep', limit: 10 })
    await analyzeValues({
      json_string: '[]',
      selected_fields: ['[].department'],
      search: null,
      sort: { by: 'count', direction: 'desc' },
      page: 1,
      page_size: 25,
      include_parent_items: true,
    })
    await analyzeAdvancedFieldDuplicates({
      json_string: '[]',
      field_path: '[].department',
      filter: { field_path: '[].status', value: 'active' },
      case_sensitive: true,
      include_parent_items: true,
      page: 1,
      page_size: 25,
    })
    await analyzeCompositeDuplicates({
      json_string: '[]',
      field_paths: ['[].department', '[].role'],
      filter: null,
      case_sensitive: true,
      include_parent_items: false,
      page: 1,
      page_size: 25,
    })
    await parseCurl({ curl: 'curl https://api.example.com' })
    await validateCurlGuardrail({ method: 'GET', url: 'https://api.example.com', redirect_target: null })
    await executeCurl({ curl: 'curl https://api.example.com', timeout_ms: 30_000, follow_redirects: true })
    await startCurlJob({
      curls: ['curl https://api.example.com'],
      timeout_ms: null,
      follow_redirects: true,
      confirm_large_batch: false,
    })
    await getCurlJobResults({ job_id: 'job-1' })
    await cancelCurlJob({ job_id: 'job-1' })

    expect(invokeMock).toHaveBeenNthCalledWith(1, 'validate_json', {
      request: { json_string: '{}' },
    })
    expect(invokeMock).toHaveBeenNthCalledWith(2, 'format_json', {
      request: { json_string: '{"id":1,"id":2}' },
    })
    expect(invokeMock).toHaveBeenNthCalledWith(3, 'analyze_json', {
      request: { json_string: '{}', min_max_deep: false, flatten: true },
    })
    expect(invokeMock).toHaveBeenNthCalledWith(4, 'get_fields', {
      request: { json_string: '{}' },
    })
    expect(invokeMock).toHaveBeenNthCalledWith(5, 'find_duplicates', {
      request: { json_string: '[]', field_path: null, case_sensitive: true },
    })
    expect(invokeMock).toHaveBeenNthCalledWith(6, 'min_max_filled', {
      request: { json_string: '[]', deep: true },
    })
    expect(invokeMock).toHaveBeenNthCalledWith(7, 'discover_values_fields', {
      request: { json_string: '[]', search: 'dep', limit: 10 },
    })
    expect(invokeMock).toHaveBeenNthCalledWith(8, 'analyze_values', {
      request: {
        json_string: '[]',
        selected_fields: ['[].department'],
        search: null,
        sort: { by: 'count', direction: 'desc' },
        page: 1,
        page_size: 25,
        include_parent_items: true,
      },
    })
    expect(invokeMock).toHaveBeenNthCalledWith(9, 'analyze_advanced_field_duplicates', {
      request: {
        json_string: '[]',
        field_path: '[].department',
        filter: { field_path: '[].status', value: 'active' },
        case_sensitive: true,
        include_parent_items: true,
        page: 1,
        page_size: 25,
      },
    })
    expect(invokeMock).toHaveBeenNthCalledWith(10, 'analyze_composite_duplicates', {
      request: {
        json_string: '[]',
        field_paths: ['[].department', '[].role'],
        filter: null,
        case_sensitive: true,
        include_parent_items: false,
        page: 1,
        page_size: 25,
      },
    })
    expect(invokeMock).toHaveBeenNthCalledWith(11, 'parse_curl', {
      request: { curl: 'curl https://api.example.com' },
    })
    expect(invokeMock).toHaveBeenNthCalledWith(12, 'validate_curl_guardrail', {
      request: { method: 'GET', url: 'https://api.example.com', redirect_target: null },
    })
    expect(invokeMock).toHaveBeenNthCalledWith(13, 'execute_curl', {
      request: { curl: 'curl https://api.example.com', timeout_ms: 30_000, follow_redirects: true },
    })
    expect(invokeMock).toHaveBeenNthCalledWith(14, 'start_curl_job', {
      request: {
        curls: ['curl https://api.example.com'],
        timeout_ms: null,
        follow_redirects: true,
        confirm_large_batch: false,
      },
    })
    expect(invokeMock).toHaveBeenNthCalledWith(15, 'get_curl_job_results', {
      request: { job_id: 'job-1' },
    })
    expect(invokeMock).toHaveBeenNthCalledWith(16, 'cancel_curl_job', {
      request: { job_id: 'job-1' },
    })
  })

  it('calls zero-argument commands without a request payload', async () => {
    invokeMock.mockResolvedValue({ ok: true })

    await getConfig()
    await getHealth()

    expect(invokeMock).toHaveBeenNthCalledWith(1, 'get_config')
    expect(invokeMock).toHaveBeenNthCalledWith(2, 'get_health')
  })

  it('preserves structured service errors for callers', () => {
    const problem = {
      error_type: 'invalid_request',
      title: 'Invalid request',
      status: 400,
      detail: 'json_string cannot be empty',
      instance: null,
      invalid_params: [{ name: 'json_string', reason: 'json_string cannot be empty' }],
    }

    expect(normalizeCommandError(problem)).toBe(problem)
    expect(normalizeCommandError(new Error('invoke failed')).detail).toBe('invoke failed')
    expect(normalizeCommandError('denied').detail).toBe('denied')
  })

  it('normalizes unknown command errors even when JSON serialization throws', () => {
    const circular: Record<string, unknown> = { message: 'circular failure' }
    circular.self = circular
    expect(normalizeCommandError(circular)).toMatchObject({
      error_type: 'tauri_invoke_error',
      detail: '[object Object]',
    })

    expect(normalizeCommandError({ toJSON: () => { throw new Error('boom') } }).detail).toBe('[object Object]')
  })
})
