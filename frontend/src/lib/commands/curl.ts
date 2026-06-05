import { COMMANDS } from './command-names'
import { invokeCommand } from './invoke-client'
import type {
  CurlExecuteRequest,
  CurlExecuteResponse,
  CurlGuardrailRequest,
  CurlGuardrailResponse,
  CurlJobRequest,
  CurlJobResponse,
  CurlJobResultsResponse,
  CurlParseRequest,
  CurlParseResponse,
  CurlStartJobRequest,
} from './types'

export async function parseCurl(request: CurlParseRequest): Promise<CurlParseResponse> {
  return invokeCommand<CurlParseResponse>(COMMANDS.parseCurl, { request })
}

export async function validateCurlGuardrail(
  request: CurlGuardrailRequest,
): Promise<CurlGuardrailResponse> {
  return invokeCommand<CurlGuardrailResponse>(COMMANDS.validateCurlGuardrail, { request })
}

export async function executeCurl(request: CurlExecuteRequest): Promise<CurlExecuteResponse> {
  return invokeCommand<CurlExecuteResponse>(COMMANDS.executeCurl, { request })
}

export async function startCurlJob(request: CurlStartJobRequest): Promise<CurlJobResponse> {
  return invokeCommand<CurlJobResponse>(COMMANDS.startCurlJob, { request })
}

export async function getCurlJobResults(request: CurlJobRequest): Promise<CurlJobResultsResponse> {
  return invokeCommand<CurlJobResultsResponse>(COMMANDS.getCurlJobResults, { request })
}

export async function cancelCurlJob(request: CurlJobRequest): Promise<CurlJobResponse> {
  return invokeCommand<CurlJobResponse>(COMMANDS.cancelCurlJob, { request })
}
