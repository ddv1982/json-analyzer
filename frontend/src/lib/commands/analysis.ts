import { COMMANDS } from './command-names'
import { invokeCommand } from './invoke-client'
import type {
  AnalysisResponse,
  AnalyzeRequest,
  DuplicatesResponse,
  FieldsResponse,
  FindDuplicatesRequest,
  FormatRequest,
  FormatResponse,
  GetFieldsRequest,
  MinMaxFilledResult,
  MinMaxRequest,
  ValidateRequest,
  ValidateResponse,
} from './types'

export async function validateJson(request: ValidateRequest): Promise<ValidateResponse> {
  return invokeCommand<ValidateResponse>(COMMANDS.validateJson, { request })
}

export async function formatJson(request: FormatRequest): Promise<FormatResponse> {
  return invokeCommand<FormatResponse>(COMMANDS.formatJson, { request })
}

export async function analyzeJson(request: AnalyzeRequest): Promise<AnalysisResponse> {
  return invokeCommand<AnalysisResponse>(COMMANDS.analyzeJson, { request })
}

export async function getFields(request: GetFieldsRequest): Promise<FieldsResponse> {
  return invokeCommand<FieldsResponse>(COMMANDS.getFields, { request })
}

export async function findDuplicates(request: FindDuplicatesRequest): Promise<DuplicatesResponse> {
  return invokeCommand<DuplicatesResponse>(COMMANDS.findDuplicates, { request })
}

export async function minMaxFilled(request: MinMaxRequest): Promise<MinMaxFilledResult> {
  return invokeCommand<MinMaxFilledResult>(COMMANDS.minMaxFilled, { request })
}
