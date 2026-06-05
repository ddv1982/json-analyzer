import { COMMANDS } from './command-names'
import { invokeCommand } from './invoke-client'
import type {
  ValuesAnalysisRequest,
  ValuesAnalysisResponse,
  ValuesExplorerAnalysisRequest,
  ValuesExplorerAnalysisResponse,
  ValuesFieldDiscoveryRequest,
  ValuesFieldDiscoveryResponse,
} from './types'

export async function discoverValuesFields(
  request: ValuesFieldDiscoveryRequest,
): Promise<ValuesFieldDiscoveryResponse> {
  return invokeCommand<ValuesFieldDiscoveryResponse>(COMMANDS.discoverValuesFields, { request })
}

export async function analyzeValues(request: ValuesAnalysisRequest): Promise<ValuesAnalysisResponse> {
  return invokeCommand<ValuesAnalysisResponse>(COMMANDS.analyzeValues, { request })
}

export async function analyzeValuesExplorer(
  request: ValuesExplorerAnalysisRequest,
): Promise<ValuesExplorerAnalysisResponse> {
  return invokeCommand<ValuesExplorerAnalysisResponse>(COMMANDS.analyzeValuesExplorer, { request })
}
