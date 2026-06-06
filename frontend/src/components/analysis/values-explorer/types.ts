import type { AppConfig } from '../../../lib/commands'

export const FALLBACK_VALUES_EXPLORER_LIMITS: AppConfig['limits']['values_explorer'] = {
  max_selected_fields: 5,
  default_page_size: 25,
  page_sizes: [10, 25, 50, 100],
  max_page_size: 100,
  max_parent_items_per_group: 100,
  max_match_combinations_per_record: 10_000,
  max_match_combinations_per_request: 100_000,
}

export const FILTER_INPUT_DEBOUNCE_MS = 250
export const DEFAULT_SORT_MODE = 'frequency'

export type ValuesSectionKey = 'duplicates' | 'all'
export type ExpandedGroupsState = Record<ValuesSectionKey, string[]>

export const EMPTY_EXPANDED_GROUPS: ExpandedGroupsState = { duplicates: [], all: [] }
