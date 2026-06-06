import { sampleJsonInput } from '../sample-data'
import {
  mockAnalyze,
  mockAnalyzeAdvancedFieldDuplicates,
  mockAnalyzeCompositeDuplicates,
  mockAnalyzeValues,
  mockDiscoverValuesFields,
  mockFindDuplicates,
  mockFormat,
  mockGetFields,
  mockMinMax,
  mockValidate,
  mockValuesExplorerResponse,
} from './analysis'
import { mockConfig } from './config'
import {
  mockCancelCurlJob,
  mockExecuteCurl,
  mockGetCurlJobResults,
  mockParseCurl,
  mockStartCurlJob,
  mockValidateCurlGuardrail,
} from './curl'
import { problem } from './problem'
import type {
  AdvancedFieldDuplicatesRequest,
  AnalyzeRequest,
  CompositeDuplicatesRequest,
  ConfigResponse,
  CurlExecuteRequest,
  CurlGuardrailRequest,
  CurlJobRequest,
  CurlParseRequest,
  CurlStartJobRequest,
  FindDuplicatesRequest,
  FormatRequest,
  GetFieldsRequest,
  HealthResponse,
  MinMaxRequest,
  ValidateRequest,
  ValuesAnalysisRequest,
  ValuesExplorerAnalysisRequest,
  ValuesFieldDiscoveryRequest,
} from '../commands'

export { mockValuesExplorerResponse, sampleJsonInput }

export async function browserMockInvoke<T>(command: string, args?: unknown): Promise<T> {
  await nextTick()

  switch (command) {
    case 'validate_json':
      return mockValidate(getRequest<ValidateRequest>(args)) as T
    case 'format_json':
      return mockFormat(getRequest<FormatRequest>(args)) as T
    case 'analyze_json':
      return mockAnalyze(getRequest<AnalyzeRequest>(args)) as T
    case 'get_fields':
      return mockGetFields(getRequest<GetFieldsRequest>(args)) as T
    case 'find_duplicates':
      return mockFindDuplicates(getRequest<FindDuplicatesRequest>(args)) as T
    case 'min_max_filled':
      return mockMinMax(getRequest<MinMaxRequest>(args)) as T
    case 'discover_values_fields':
      return mockDiscoverValuesFields(getRequest<ValuesFieldDiscoveryRequest>(args)) as T
    case 'analyze_values':
      return mockAnalyzeValues(getRequest<ValuesAnalysisRequest>(args)) as T
    case 'analyze_values_explorer':
      return mockValuesExplorerResponse(getRequest<ValuesExplorerAnalysisRequest>(args)) as T
    case 'analyze_advanced_field_duplicates':
      return mockAnalyzeAdvancedFieldDuplicates(getRequest<AdvancedFieldDuplicatesRequest>(args)) as T
    case 'analyze_composite_duplicates':
      return mockAnalyzeCompositeDuplicates(getRequest<CompositeDuplicatesRequest>(args)) as T
    case 'parse_curl':
      return mockParseCurl(getRequest<CurlParseRequest>(args)) as T
    case 'validate_curl_guardrail':
      return mockValidateCurlGuardrail(getRequest<CurlGuardrailRequest>(args)) as T
    case 'execute_curl':
      return mockExecuteCurl(getRequest<CurlExecuteRequest>(args)) as T
    case 'start_curl_job':
      return mockStartCurlJob(getRequest<CurlStartJobRequest>(args)) as T
    case 'get_curl_job_results':
      return mockGetCurlJobResults(getRequest<CurlJobRequest>(args)) as T
    case 'cancel_curl_job':
      return mockCancelCurlJob(getRequest<CurlJobRequest>(args)) as T
    case 'get_config': {
      const response: ConfigResponse = { config: mockConfig() }
      return response as T
    }
    case 'get_health': {
      const response: HealthResponse = { status: 'ok', app: 'json-analyzer', version: 'browser-mock' }
      return response as T
    }
    default:
      throw problem('unknown_command', 'Unknown command', `No browser mock exists for ${command}`)
  }
}


function getRequest<T>(args: unknown): T {
  if (typeof args !== 'object' || args === null || !('request' in args)) {
    throw problem('invalid_request', 'Invalid request', 'Missing Tauri request payload')
  }
  return (args as { request: T }).request
}

function nextTick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 75))
}
