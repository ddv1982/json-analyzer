import { COMMANDS } from './command-names'
import { invokeCommand } from './invoke-client'
import type { ConfigResponse, HealthResponse } from './types'

export async function getConfig(): Promise<ConfigResponse> {
  return invokeCommand<ConfigResponse>(COMMANDS.getConfig)
}

export async function getHealth(): Promise<HealthResponse> {
  return invokeCommand<HealthResponse>(COMMANDS.getHealth)
}
