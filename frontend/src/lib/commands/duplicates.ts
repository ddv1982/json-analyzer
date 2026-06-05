import { COMMANDS } from './command-names'
import { invokeCommand } from './invoke-client'
import type {
  AdvancedFieldDuplicatesRequest,
  AdvancedFieldDuplicatesResponse,
  CompositeDuplicatesRequest,
  CompositeDuplicatesResponse,
} from './types'

export async function analyzeAdvancedFieldDuplicates(
  request: AdvancedFieldDuplicatesRequest,
): Promise<AdvancedFieldDuplicatesResponse> {
  return invokeCommand<AdvancedFieldDuplicatesResponse>(COMMANDS.analyzeAdvancedFieldDuplicates, { request })
}

export async function analyzeCompositeDuplicates(
  request: CompositeDuplicatesRequest,
): Promise<CompositeDuplicatesResponse> {
  return invokeCommand<CompositeDuplicatesResponse>(COMMANDS.analyzeCompositeDuplicates, { request })
}
