import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, vi } from 'vitest'
import { browserMockInvoke } from '../lib/browser-mocks'
import { sampleJsonInput as sampleJsonInputFixture } from '../lib/sample-data'
import { setMockPrefersColorScheme as setMockPrefersColorSchemeInSetup } from './setup'
import {
  analyzeAdvancedFieldDuplicates,
  analyzeCompositeDuplicates,
  analyzeJson,
  analyzeValues,
  cancelCurlJob,
  discoverValuesFields,
  executeCurl,
  formatJson,
  getConfig,
  getCurlJobResults,
  startCurlJob,
  validateJson,
} from '../lib/commands'
import type {
  AdvancedFieldDuplicatesRequest,
  AdvancedFieldDuplicatesResponse,
  AnalysisResponse,
  CompositeDuplicatesRequest,
  CompositeDuplicatesResponse,
  ConfigResponse,
  CurlExecuteResponse,
  CurlGuardrailResponse,
  CurlJobResponse,
  CurlJobResultsResponse,
  CurlParseResponse,
  ProblemDetails,
  ValidateResponse,
  ValuesAnalysisRequest,
  ValuesAnalysisResponse,
  ValuesFieldDiscoveryResponse,
} from '../lib/commands'

export type {
  AnalysisResponse,
  CurlJobResponse,
  CurlJobResultsResponse,
  ValidateResponse,
  ValuesAnalysisRequest,
  ValuesAnalysisResponse,
} from '../lib/commands'

export function setMockPrefersColorScheme(theme: 'light' | 'dark') {
  setMockPrefersColorSchemeInSetup(theme)
}

vi.mock('../lib/commands', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/commands')>()
  return {
    ...actual,
    validateJson: vi.fn(),
    formatJson: vi.fn(),
    analyzeJson: vi.fn(),
    discoverValuesFields: vi.fn(),
    getConfig: vi.fn(),
    analyzeValues: vi.fn(),
    analyzeAdvancedFieldDuplicates: vi.fn(),
    analyzeCompositeDuplicates: vi.fn(),
    executeCurl: vi.fn(),
    startCurlJob: vi.fn(),
    getCurlJobResults: vi.fn(),
    cancelCurlJob: vi.fn(),
  }
})

const { default: App } = await import('../App')

export const sampleJsonInput = sampleJsonInputFixture

export const validateJsonMock = vi.mocked(validateJson)
export const formatJsonMock = vi.mocked(formatJson)
export const analyzeJsonMock = vi.mocked(analyzeJson)
export const discoverValuesFieldsMock = vi.mocked(discoverValuesFields)
export const getConfigMock = vi.mocked(getConfig)
export const analyzeValuesMock = vi.mocked(analyzeValues)
export const analyzeAdvancedFieldDuplicatesMock = vi.mocked(analyzeAdvancedFieldDuplicates)
export const analyzeCompositeDuplicatesMock = vi.mocked(analyzeCompositeDuplicates)
export const executeCurlMock = vi.mocked(executeCurl)
export const startCurlJobMock = vi.mocked(startCurlJob)
export const getCurlJobResultsMock = vi.mocked(getCurlJobResults)
export const cancelCurlJobMock = vi.mocked(cancelCurlJob)
export const writeClipboardTextMock = vi.fn<(text: string) => Promise<void>>()

export const validationOk: ValidateResponse = {
  valid: true,
  document_count: 1,
  compact_json: '{"ok":true}',
  warnings: [],
}

export const invalidJsonProblem: ProblemDetails = {
  error_type: 'parse_error',
  title: 'Invalid JSON',
  status: 400,
  detail: 'Unexpected token }',
  instance: null,
  position: { offset: 17, line: 1, column: 18 },
}

export let fixtureAnalysis: AnalysisResponse

export const appConfig: ConfigResponse = {
  config: {
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
  },
}

export const curlPreviewOk: CurlParseResponse = {
  parsed: {
    method: 'POST',
    url: 'https://api.example.com/users',
    headers: [
      { name: 'Authorization', value: 'Bearer ***', redacted: true },
      { name: 'Content-Type', value: 'application/json', redacted: false },
    ],
    body: '{"name":"Alice"}',
    body_kind: 'json_string',
    auth: { bearer_token_present: true, scheme: 'Bearer' },
    supported_options: ['-X', '-H', '--data'],
    warnings: [],
  },
}

export const guardrailOk: CurlGuardrailResponse = {
  decision: { allowed: true, reason: 'public_https_url', error_type: null },
}

export const curlExecutionOk: CurlExecuteResponse = {
  request_preview: curlPreviewOk.parsed,
  guardrail: guardrailOk.decision,
  response: {
    status: 200,
    status_text: 'OK',
    headers: [
      { name: 'Content-Type', value: 'application/json', redacted: false },
      { name: 'Set-Cookie', value: '***', redacted: true },
    ],
    body: '{"ok":true}',
    body_truncated: false,
    elapsed_ms: 12,
    response_bytes: 11,
  },
}

export const curlJobStarted: CurlJobResponse = {
  job: {
    job_id: 'job-async-1',
    status: 'running',
    total_requests: 1,
    completed_requests: 0,
    failed_requests: 0,
    canceled_requests: 0,
    created_at_utc: '2026-06-03T12:00:00Z',
    updated_at_utc: '2026-06-03T12:00:00Z',
  },
}

export const curlJobSucceeded: CurlJobResultsResponse = {
  job: {
    ...curlJobStarted.job,
    status: 'succeeded',
    completed_requests: 1,
    updated_at_utc: '2026-06-03T12:00:01Z',
  },
  results: [
    {
      index: 0,
      status: 'succeeded',
      request_preview: curlPreviewOk.parsed,
      response: curlExecutionOk.response,
      error: null,
    },
  ],
}

export const curlJobCanceled: CurlJobResponse = {
  job: {
    ...curlJobStarted.job,
    status: 'canceled',
    canceled_requests: 1,
    updated_at_utc: '2026-06-03T12:00:01Z',
  },
}

export const curlJobCanceledResults: CurlJobResultsResponse = {
  job: curlJobCanceled.job,
  results: [
    {
      index: 0,
      status: 'canceled',
      request_preview: curlPreviewOk.parsed,
      response: null,
      error: null,
    },
  ],
}

export const valuesFields: ValuesFieldDiscoveryResponse['fields'] = [
  {
    field_path: '[].department',
    label: 'Department',
    type_hints: ['str'],
    non_null_count: 8,
    null_count: 0,
    missing_count: 0,
    unique_value_count: 3,
    sample_values: ['Engineering', 'Design', 'Support'],
  },
  {
    field_path: '[].role',
    label: 'Role',
    type_hints: ['str'],
    non_null_count: 8,
    null_count: 0,
    missing_count: 0,
    unique_value_count: 4,
    sample_values: ['Developer', 'Designer', 'Analyst'],
  },
  {
    field_path: '[].location',
    label: 'Location',
    type_hints: ['str'],
    non_null_count: 8,
    null_count: 0,
    missing_count: 0,
    unique_value_count: 4,
    sample_values: ['Amsterdam', 'Rotterdam', 'Utrecht'],
  },
  {
    field_path: '[].status',
    label: 'Status',
    type_hints: ['str'],
    non_null_count: 8,
    null_count: 0,
    missing_count: 0,
    unique_value_count: 2,
    sample_values: ['active', 'inactive'],
  },
  {
    field_path: '[].name',
    label: 'Name',
    type_hints: ['str'],
    non_null_count: 8,
    null_count: 0,
    missing_count: 0,
    unique_value_count: 8,
    sample_values: ['Alice', 'Bob', 'Carol'],
  },
  {
    field_path: '[].id',
    label: 'Id',
    type_hints: ['number'],
    non_null_count: 8,
    null_count: 0,
    missing_count: 0,
    unique_value_count: 8,
    sample_values: [1, 2, 3],
  },
]

export function valuesResponse(request: ValuesAnalysisRequest): ValuesAnalysisResponse {
  const supportOnly = request.search === 'sup'
  const designOnly = request.search === 'des'
  return {
    selected_fields: request.selected_fields,
    total_groups: supportOnly || designOnly ? 1 : 3,
    page: request.page,
    page_size: request.page_size,
    has_next_page: !supportOnly && !designOnly && request.page === 1,
    groups: supportOnly
      ? [
          {
            key: ['Support'],
            display_value: 'Support',
            count: 2,
            source_paths: ['5.department', '6.department'],
            record_indexes: [5, 6],
            parent_items: [],
          },
        ]
      : designOnly
        ? [
            {
              key: ['Design'],
              display_value: 'Design',
              count: 1,
              source_paths: ['2.department'],
              record_indexes: [2],
              parent_items: [],
            },
          ]
        : [
          {
            key: request.selected_fields.length > 1 ? ['Engineering', 'Developer'] : ['Engineering'],
            display_value: request.selected_fields.length > 1 ? 'Engineering | Developer' : 'Engineering',
            count: 4,
            source_paths: ['0.department', '1.department', '3.department', '4.department'],
            record_indexes: [0, 1, 3, 4],
            parent_items: [
              {
                record_index: 0,
                source_path: '0',
                summary: { id: 1, name: 'Alice', department: 'Engineering' },
              },
            ],
          },
          {
            key: request.selected_fields.length > 1 ? ['Design', 'Designer'] : ['Design'],
            display_value: request.selected_fields.length > 1 ? 'Design | Designer' : 'Design',
            count: 1,
            source_paths: ['2.department'],
            record_indexes: [2],
            parent_items: request.include_parent_items
              ? [{ record_index: 2, source_path: '2', summary: { id: 3, name: 'Carol', department: 'Design' } }]
              : [],
          },
        ],
  }
}

export function advancedFieldDuplicateResponse(request: AdvancedFieldDuplicatesRequest): AdvancedFieldDuplicatesResponse {
  if (request.field_path === '[].name') {
    return {
      field_path: request.field_path,
      total_items_considered: 8,
      duplicate_group_count: 0,
      page: request.page,
      page_size: request.page_size,
      has_next_page: false,
      duplicates: [],
      all_values_summary: [
        { value: 'Alice', display_value: 'Alice', count: 1, is_duplicate: false },
        { value: 'Bob', display_value: 'Bob', count: 1, is_duplicate: false },
      ],
    }
  }

  const filtered = request.filter?.field_path === '[].status'
  return {
    field_path: request.field_path,
    total_items_considered: filtered ? 6 : 8,
    duplicate_group_count: filtered ? 2 : 3,
    page: request.page,
    page_size: request.page_size,
    has_next_page: false,
    duplicates: [
      {
        value: 'Engineering',
        display_value: 'Engineering',
        count: filtered ? 3 : 4,
        record_indexes: filtered ? [0, 1, 4] : [0, 1, 3, 4],
        source_paths: filtered
          ? ['0.department', '1.department', '4.department']
          : ['0.department', '1.department', '3.department', '4.department'],
        parent_items: request.include_parent_items
          ? [{ record_index: 0, source_path: '0', summary: { id: 1, name: 'Alice', department: 'Engineering' } }]
          : [],
      },
    ],
    all_values_summary: [
      { value: 'Engineering', display_value: 'Engineering', count: filtered ? 3 : 4, is_duplicate: true },
      { value: 'Design', display_value: 'Design', count: 2, is_duplicate: true },
      { value: 'Support', display_value: 'Support', count: filtered ? 1 : 2, is_duplicate: !filtered },
    ],
  }
}

export function compositeDuplicateResponse(request: CompositeDuplicatesRequest): CompositeDuplicatesResponse {
  return {
    field_paths: request.field_paths,
    duplicate_group_count: 3,
    page: request.page,
    page_size: request.page_size,
    has_next_page: false,
    duplicates: [
      {
        key: ['Engineering', 'Developer'],
        count: 3,
        record_indexes: [0, 1, 4],
        source_paths: ['0.department', '0.role', '1.department', '1.role', '4.department', '4.role'],
        parent_items: request.include_parent_items
          ? [{ record_index: 0, source_path: '0', summary: { id: 1, name: 'Alice', department: 'Engineering', role: 'Developer' } }]
          : [],
      },
    ],
  }
}

export async function loadFixtureAnalysis() {
  fixtureAnalysis = await browserMockInvoke<AnalysisResponse>('analyze_json', {
    request: { json_string: sampleJsonInput, min_max_deep: true },
  })
  return fixtureAnalysis
}

export function installClipboardMock() {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: writeClipboardTextMock },
  })
}

export function setupDefaultAppMocks() {
  if (!fixtureAnalysis) {
    throw new Error('App test fixture analysis is not loaded. Call loadFixtureAnalysis() in beforeAll before setupDefaultAppMocks().')
  }

  validateJsonMock.mockReset()
  formatJsonMock.mockReset()
  analyzeJsonMock.mockReset()
  discoverValuesFieldsMock.mockReset()
  getConfigMock.mockReset()
  analyzeValuesMock.mockReset()
  analyzeAdvancedFieldDuplicatesMock.mockReset()
  analyzeCompositeDuplicatesMock.mockReset()
  executeCurlMock.mockReset()
  startCurlJobMock.mockReset()
  getCurlJobResultsMock.mockReset()
  cancelCurlJobMock.mockReset()
  writeClipboardTextMock.mockReset()
  installClipboardMock()
  validateJsonMock.mockResolvedValue(validationOk)
  formatJsonMock.mockResolvedValue({ formatted_json: sampleJsonInput })
  analyzeJsonMock.mockResolvedValue(fixtureAnalysis)
  getConfigMock.mockResolvedValue(appConfig)
  discoverValuesFieldsMock.mockResolvedValue({ fields: valuesFields })
  analyzeValuesMock.mockImplementation((request) => Promise.resolve(valuesResponse(request)))
  analyzeAdvancedFieldDuplicatesMock.mockImplementation((request) => Promise.resolve(advancedFieldDuplicateResponse(request)))
  analyzeCompositeDuplicatesMock.mockImplementation((request) => Promise.resolve(compositeDuplicateResponse(request)))
  executeCurlMock.mockResolvedValue(curlExecutionOk)
  startCurlJobMock.mockResolvedValue(curlJobStarted)
  getCurlJobResultsMock.mockResolvedValue(curlJobSucceeded)
  cancelCurlJobMock.mockResolvedValue(curlJobCanceled)
  writeClipboardTextMock.mockResolvedValue()
}

export function renderApp() {
  return render(<App />)
}

export async function unlockCurlBatchMode() {
  fireEvent.click(screen.getByRole('button', { name: /^execute$/i }))
  await screen.findByLabelText(/curl execution response/i)
  const batchRadio = screen.getByRole('radio', { name: /batch mode/i })
  await waitFor(() => {
    expect(batchRadio).toBeEnabled()
  })
  fireEvent.click(batchRadio)
}

export function deferred<T>() {
  let resolve: (value: T) => void = () => undefined
  let reject: (reason?: unknown) => void = () => undefined
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })
  return { promise, resolve, reject }
}
