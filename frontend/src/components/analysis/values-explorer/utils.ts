import type { ValuesExplorerGroup, ValuesFieldInfo } from '../../../lib/commands'
import type { ValuesSectionKey } from './types'

export function fieldSummaryFallback(fieldPath: string): ValuesFieldInfo {
  return {
    field_path: fieldPath,
    label: fieldPath,
    type_hints: [],
    non_null_count: 0,
    null_count: 0,
    missing_count: 0,
    unique_value_count: 0,
    sample_values: [],
  }
}

export function formatDisplayValue(value: unknown, fallback: string): string {
  if (value === null || value === undefined || fallback === '') {
    return 'No data'
  }
  return fallback.length > 180 ? `${fallback.slice(0, 177)}...` : fallback
}

export function valueGroupCopyKey(sectionKey: ValuesSectionKey, group: ValuesExplorerGroup) {
  return `values-${sectionKey}-${valueGroupId(group)}`
}

export function valueGroupId(group: ValuesExplorerGroup) {
  const identity = JSON.stringify({ value: group.value, display: group.display_value, count: group.count })
  let hash = 5381
  for (let index = 0; index < identity.length; index += 1) {
    hash = ((hash << 5) + hash) ^ identity.charCodeAt(index)
  }
  return (hash >>> 0).toString(36)
}
