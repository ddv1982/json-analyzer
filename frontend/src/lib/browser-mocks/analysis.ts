import sourceFixtures from '../../../../tests/fixtures/golden/source-mvp-starter-fixtures.json'
import parityContracts from '../../../../tests/fixtures/golden/full-source-parity-contracts.json'
import type {
  AdvancedFieldDuplicateGroup,
  AdvancedFieldDuplicatesRequest,
  AdvancedFieldDuplicatesResponse,
  AnalysisResponse,
  AnalyzeRequest,
  CompositeDuplicateGroup,
  CompositeDuplicatesRequest,
  CompositeDuplicatesResponse,
  DuplicateFilter,
  DuplicatesResponse,
  ExactDuplicatesResult,
  FieldPattern,
  FieldsResponse,
  FindDuplicatesRequest,
  FormatRequest,
  FormatResponse,
  GetFieldsRequest,
  MinMaxFilledResult,
  MinMaxRequest,
  SchemaNode,
  StatisticsAnalysis,
  StructureAnalysis,
  ValidateRequest,
  ValidateResponse,
  ValuesAnalysisRequest,
  ValuesAnalysisResponse,
  ValuesExplorerAnalysisRequest,
  ValuesExplorerAnalysisResponse,
  ValuesExplorerGroup,
  ValuesFieldDiscoveryRequest,
  ValuesFieldDiscoveryResponse,
  ValuesGroup,
} from '../commands'
import { mockConfig } from './config'
import { problem } from './problem'

interface FixtureRoot {
  validation: {
    concatenated_roots: { input: string }
  }
  field_paths_patterns: {
    input_data: unknown
    expected_flattened: Record<string, unknown>
    expected_field_patterns_subset: Record<string, FieldPattern>
  }
  exact_duplicates: {
    input_data: unknown
    expected_source_legacy: {
      total_items: number
      unique_items: number
      duplicate_groups: number
      duplicates: Record<string, number[]>
      has_duplicates: boolean
      analysis_path: string
    }
  }
  min_max_filled: {
    input_data: unknown
    expected_deep_true_summary: FixtureMinMaxSummary
    expected_deep_false_summary: FixtureMinMaxSummary
  }
  structure_statistics: {
    expected_source_statistics: {
      total_fields: number
      type_distribution: Record<string, number>
      null_count: number
      string_length_stats: {
        count: number
        min: number
        max: number
        avg: number
      }
      field_value_distribution: Record<string, Record<string, number>>
      unique_field_paths: number
    }
  }
}

interface ParityFixtureRoot {
  shared_dataset: {
    records: unknown[]
    field_patterns: string[]
  }
  values_explorer: {
    field_discovery_contract: {
      expected_fields: ValuesFieldDiscoveryResponse['fields']
    }
    single_field_values_contract: {
      expected_response: Omit<ValuesAnalysisResponse, 'selected_fields'>
    }
    search_sort_pagination_contract: {
      expected_response: {
        total_groups: number
        groups: Partial<ValuesGroup>[]
      }
    }
    multi_field_values_contract: {
      expected_groups: Partial<ValuesGroup>[]
    }
  }
}

interface ValuePathMatch {
  value: unknown
  sourcePath: string
}

interface MockValuesGroupAccumulator extends ValuesGroup {
  identity: string
  firstSourcePath: string
}

interface FixtureMinMaxSummary {
  analysis_path: string
  total_records: number
  min_record: {
    index: number
    filled_count: number
    total_fields: number
    completeness_pct: number
  }
  max_record: {
    index: number
    filled_count: number
    total_fields: number
    completeness_pct: number
  }
  statistics: {
    total_records: number
    avg_filled_fields: number
    median_filled_fields: number
    std_filled_fields: number
    avg_completeness_pct: number
    field_count_distribution: Record<string, number>
  }
  has_records: boolean
}

const fixtures = sourceFixtures as unknown as FixtureRoot
const parity = parityContracts as unknown as ParityFixtureRoot

export function mockValidate(request: ValidateRequest): ValidateResponse {
  if (request.json_string.length === 0) {
    throw problem('invalid_request', 'Invalid request', 'json_string cannot be empty')
  }

  if (request.json_string === fixtures.validation.concatenated_roots.input) {
    throw problem(
      'json_parse_error',
      'Invalid JSON',
      'trailing characters after JSON root at line 2 column 1 (byte 9)',
      { offset: 9, line: 2, column: 1 },
    )
  }

  try {
    const parsed = JSON.parse(request.json_string) as unknown
    return {
      valid: true,
      document_count: 1,
      compact_json: JSON.stringify(parsed),
      warnings: [],
    }
  } catch (error) {
    throw problem(
      'json_parse_error',
      'Invalid JSON',
      error instanceof Error ? error.message : 'Unable to parse JSON input',
    )
  }
}

export function mockFormat(request: FormatRequest): FormatResponse {
  mockValidate({ json_string: request.json_string })

  return {
    formatted_json: mayContainDuplicateObjectKeys(request.json_string)
      ? request.json_string.trim()
      : JSON.stringify(safeParseJson(request.json_string), null, 2),
  }
}

export function mockAnalyze(request: AnalyzeRequest): AnalysisResponse {
  mockValidate({ json_string: request.json_string })
  const parsed = flattenOneLevelIfListOfLists(safeParseJson(request.json_string), request.flatten ?? false)
  const structure = fixtureStructure(parsed)
  return {
    structure,
    statistics: fixtureStatistics(),
    fields: fixtureFields(),
    exact_duplicates: fixtureExactDuplicates(),
    min_max_filled: fixtureMinMax(request.min_max_deep ?? true),
  }
}

export function mockMinMax(request: MinMaxRequest): MinMaxFilledResult {
  mockValidate({ json_string: request.json_string })
  return fixtureMinMax(request.deep ?? true)
}

export function mockGetFields(_request: GetFieldsRequest): FieldsResponse {
  return { fields: fixtureFields() }
}

export function mockFindDuplicates(_request: FindDuplicatesRequest): DuplicatesResponse {
  return { kind: 'exact', result: fixtureExactDuplicates() }
}

export function mockDiscoverValuesFields(
  request: ValuesFieldDiscoveryRequest,
): ValuesFieldDiscoveryResponse {
  if (request.limit === 0) {
    throw problem('invalid_request', 'Invalid request', 'limit must be greater than or equal to 1 when provided')
  }

  mockValidate({ json_string: request.json_string })
  flattenOneLevelIfListOfLists(safeParseJson(request.json_string), request.flatten ?? false)
  const search = request.search?.trim().toLowerCase()
  let fields = mockValuesFields()

  if (search) {
    fields = fields.filter(
      (field) =>
        field.field_path.toLowerCase().includes(search) || field.label.toLowerCase().includes(search),
    )
  }

  return { fields: request.limit === undefined || request.limit === null ? fields : fields.slice(0, request.limit) }
}

export function mockAnalyzeValues(request: ValuesAnalysisRequest): ValuesAnalysisResponse {
  mockValidate({ json_string: request.json_string })
  flattenOneLevelIfListOfLists(safeParseJson(request.json_string), request.flatten ?? false)

  const valuesLimits = mockConfig().limits.values_explorer
  if (request.selected_fields.length === 0 || request.selected_fields.length > valuesLimits.max_selected_fields) {
    throw problem('invalid_request', 'Invalid request', `selected_fields supports 1 to ${valuesLimits.max_selected_fields} fields`)
  }

  const selectedFields = request.selected_fields.map((field) => field.trim())
  if (selectedFields.some((field) => field.length === 0)) {
    throw problem('invalid_request', 'Invalid request', 'selected_fields cannot contain empty fields')
  }
  if (new Set(selectedFields).size !== selectedFields.length) {
    throw problem('invalid_request', 'Invalid request', 'selected_fields must contain unique fields')
  }

  if (request.page < 1) {
    throw problem('invalid_request', 'Invalid request', 'page must be greater than or equal to 1')
  }

  if (request.page_size < 1) {
    throw problem('invalid_request', 'Invalid request', 'page_size must be greater than or equal to 1')
  }
  if (request.page_size > valuesLimits.max_page_size) {
    throw problem('invalid_request', 'Invalid request', `page_size cannot exceed ${valuesLimits.max_page_size}`)
  }

  const normalizedRequest = { ...request, selected_fields: selectedFields }
  const allGroups = buildMockValuesGroups(normalizedRequest)
  const totalGroups = allGroups.length
  const start = (request.page - 1) * request.page_size
  const end = Math.min(start + request.page_size, totalGroups)
  const groups = start >= totalGroups ? [] : allGroups.slice(start, end)

  return {
    selected_fields: selectedFields,
    total_groups: totalGroups,
    page: request.page,
    page_size: request.page_size,
    has_next_page: end < totalGroups,
    groups,
  }
}

export function mockValuesExplorerResponse(request: ValuesExplorerAnalysisRequest): ValuesExplorerAnalysisResponse {
  mockValidate({ json_string: request.json_string })
  flattenOneLevelIfListOfLists(safeParseJson(request.json_string), request.flatten ?? false)

  const valuesLimits = mockConfig().limits.values_explorer
  if (request.selected_fields.length === 0 || request.selected_fields.length > valuesLimits.max_selected_fields) {
    throw problem('invalid_request', 'Invalid request', `selected_fields supports 1 to ${valuesLimits.max_selected_fields} fields`)
  }
  validateMockPagination(request.page, request.page_size, valuesLimits.max_page_size)
  const groupsPage = request.groups_page ?? request.page
  if (groupsPage < 1) {
    throw problem('invalid_request', 'Invalid request', 'groups_page must be greater than or equal to 1')
  }

  const selectedFields = request.selected_fields.map((field) => field.trim())
  if (selectedFields.some((field) => field.length === 0)) {
    throw problem('invalid_request', 'Invalid request', 'selected_fields cannot contain empty fields')
  }
  if (new Set(selectedFields).size !== selectedFields.length) {
    throw problem('invalid_request', 'Invalid request', 'selected_fields must contain unique fields')
  }
  if (request.filter && (!request.filter.field_path.trim() || !request.filter.value.trim())) {
    throw problem('invalid_request', 'Invalid request', 'filter field and value are required')
  }

  const groups = buildMockValuesExplorerGroups({ ...request, selected_fields: selectedFields })
  const duplicateGroups = groups.filter((group) => group.count > 1)
  const start = (request.page - 1) * request.page_size
  const end = start + request.page_size
  const allStart = (groupsPage - 1) * request.page_size
  const allEnd = allStart + request.page_size
  const duplicatePage = duplicateGroups.slice(start, end)
  const allPage = groups.slice(allStart, allEnd)

  return {
    field_path: selectedFields.join(' + '),
    field_paths: selectedFields,
    is_composite: selectedFields.length > 1,
    total_items: groups.reduce((total, group) => total + group.count, 0),
    unique_values: groups.length,
    duplicate_group_count: duplicateGroups.length,
    has_duplicates: duplicateGroups.length > 0,
    duplicates: duplicatePage,
    all_field_values: allPage,
    page: request.page,
    page_size: request.page_size,
    total_pages: Math.max(1, Math.ceil(duplicateGroups.length / request.page_size)),
    has_next_page: request.page < Math.max(1, Math.ceil(duplicateGroups.length / request.page_size)),
    groups_page: groupsPage,
    groups_total_pages: Math.max(1, Math.ceil(groups.length / request.page_size)),
    sort_mode: request.sort_mode,
    filter: request.filter ?? null,
  }
}

export function mockAnalyzeAdvancedFieldDuplicates(
  request: AdvancedFieldDuplicatesRequest,
): AdvancedFieldDuplicatesResponse {
  mockValidate({ json_string: request.json_string })

  if (request.field_path.trim().length === 0) {
    throw problem('invalid_request', 'Invalid request', 'field_path cannot be empty')
  }
  validateMockPagination(request.page, request.page_size, mockConfig().limits.duplicates.max_page_size)

  const groups = buildMockAdvancedFieldDuplicateGroups(request)
  const duplicateGroups = groups.filter((group) => group.count > 1)
  const start = (request.page - 1) * request.page_size
  const end = Math.min(start + request.page_size, duplicateGroups.length)

  return {
    field_path: request.field_path,
    total_items_considered: groups.reduce((total, group) => total + group.count, 0),
    duplicate_group_count: duplicateGroups.length,
    page: request.page,
    page_size: request.page_size,
    has_next_page: end < duplicateGroups.length,
    duplicates: start >= duplicateGroups.length ? [] : duplicateGroups.slice(start, end),
    all_values_summary: groups.map((group) => ({
      value: group.value,
      display_value: group.display_value,
      count: group.count,
      is_duplicate: group.count > 1,
    })),
  }
}

export function mockAnalyzeCompositeDuplicates(request: CompositeDuplicatesRequest): CompositeDuplicatesResponse {
  mockValidate({ json_string: request.json_string })

  const duplicateLimits = mockConfig().limits.duplicates
  if (request.field_paths.length < duplicateLimits.composite_min_fields || request.field_paths.length > duplicateLimits.composite_max_fields) {
    throw problem('invalid_request', 'Invalid request', `field_paths supports ${duplicateLimits.composite_min_fields} to ${duplicateLimits.composite_max_fields} fields`)
  }
  if (new Set(request.field_paths.map((field) => field.trim())).size !== request.field_paths.length) {
    throw problem('invalid_request', 'Invalid request', 'field_paths must contain unique fields')
  }
  validateMockPagination(request.page, request.page_size, mockConfig().limits.duplicates.max_page_size)

  const groups = buildMockCompositeDuplicateGroups(request).filter((group) => group.count > 1)
  const start = (request.page - 1) * request.page_size
  const end = Math.min(start + request.page_size, groups.length)

  return {
    field_paths: request.field_paths,
    duplicate_group_count: groups.length,
    page: request.page,
    page_size: request.page_size,
    has_next_page: end < groups.length,
    duplicates: start >= groups.length ? [] : groups.slice(start, end),
  }
}

function validateMockPagination(page: number, pageSize: number, maxPageSize: number) {
  if (page < 1) {
    throw problem('invalid_request', 'Invalid request', 'page must be greater than or equal to 1')
  }
  if (pageSize < 1) {
    throw problem('invalid_request', 'Invalid request', 'page_size must be greater than or equal to 1')
  }
  if (pageSize > maxPageSize) {
    throw problem('invalid_request', 'Invalid request', `page_size cannot exceed ${maxPageSize}`)
  }
}

function buildMockAdvancedFieldDuplicateGroups(request: AdvancedFieldDuplicatesRequest): AdvancedFieldDuplicateGroup[] {
  const groups: (AdvancedFieldDuplicateGroup & { identity: string; firstSourcePath: string })[] = []
  const caseSensitive = request.case_sensitive ?? true

  parity.shared_dataset.records.forEach((record, recordIndex) => {
    if (!mockRecordMatchesFilter(record, request.filter ?? null, caseSensitive)) {
      return
    }

    for (const match of valuePathMatchesAtFieldPath(record, request.field_path)) {
      if (match.value === null) {
        continue
      }
      const value = caseSensitive ? normalizeJsonValue(match.value) : normalizeCaseInsensitiveValue(match.value)
      const identity = `${typeHintForValue(value)}:${JSON.stringify(value)}`
      const sourcePath = recordSourcePath(recordIndex, match.sourcePath)
      const existing = groups.find((group) => group.identity === identity)

      if (existing) {
        existing.count += 1
        existing.source_paths.push(sourcePath)
        if (!existing.record_indexes.includes(recordIndex)) {
          existing.record_indexes.push(recordIndex)
        }
        if (request.include_parent_items && !existing.parent_items.some((item) => item.record_index === recordIndex)) {
          existing.parent_items.push(parentItemForMockRecord(record, recordIndex, [request.field_path, request.filter?.field_path ?? '']))
        }
        continue
      }

      groups.push({
        identity,
        firstSourcePath: sourcePath,
        value,
        display_value: displayMockValue(match.value),
        count: 1,
        source_paths: [sourcePath],
        record_indexes: [recordIndex],
        parent_items: request.include_parent_items
          ? [parentItemForMockRecord(record, recordIndex, [request.field_path, request.filter?.field_path ?? ''])]
          : [],
      })
    }
  })

  groups.sort((left, right) => right.count - left.count || left.display_value.localeCompare(right.display_value) || left.firstSourcePath.localeCompare(right.firstSourcePath))
  return groups.map(({ identity: _identity, firstSourcePath: _firstSourcePath, ...group }) => group)
}

function buildMockCompositeDuplicateGroups(request: CompositeDuplicatesRequest): CompositeDuplicateGroup[] {
  const groups: (CompositeDuplicateGroup & { identity: string; displayValue: string; firstSourcePath: string })[] = []
  const caseSensitive = request.case_sensitive ?? true

  parity.shared_dataset.records.forEach((record, recordIndex) => {
    if (!mockRecordMatchesFilter(record, request.filter ?? null, caseSensitive)) {
      return
    }

    const perFieldMatches = request.field_paths.map((fieldPath) => valuePathMatchesAtFieldPath(record, fieldPath))
    if (perFieldMatches.some((matches) => matches.length === 0)) {
      return
    }

    for (const combination of cartesianValueMatches(perFieldMatches)) {
      const key = combination.map((match) => caseSensitive ? normalizeJsonValue(match.value) : normalizeCaseInsensitiveValue(match.value))
      const identity = key.map((value) => `${typeHintForValue(value)}:${JSON.stringify(value)}`).join('|')
      const sourcePaths = combination.map((match) => recordSourcePath(recordIndex, match.sourcePath))
      const displayValue = combination.map((match) => displayMockValue(match.value)).join(' | ')
      const existing = groups.find((group) => group.identity === identity)

      if (existing) {
        existing.count += 1
        existing.source_paths.push(...sourcePaths)
        if (!existing.record_indexes.includes(recordIndex)) {
          existing.record_indexes.push(recordIndex)
        }
        if (request.include_parent_items && !existing.parent_items.some((item) => item.record_index === recordIndex)) {
          existing.parent_items.push(parentItemForMockRecord(record, recordIndex, request.field_paths))
        }
        continue
      }

      groups.push({
        identity,
        displayValue,
        firstSourcePath: sourcePaths[0] ?? '',
        key,
        count: 1,
        source_paths: sourcePaths,
        record_indexes: [recordIndex],
        parent_items: request.include_parent_items ? [parentItemForMockRecord(record, recordIndex, request.field_paths)] : [],
      })
    }
  })

  groups.sort((left, right) => right.count - left.count || left.displayValue.localeCompare(right.displayValue) || left.firstSourcePath.localeCompare(right.firstSourcePath))
  return groups.map(({ identity: _identity, displayValue: _displayValue, firstSourcePath: _firstSourcePath, ...group }) => group)
}

function mockRecordMatchesFilter(record: unknown, filter: DuplicateFilter | null, caseSensitive: boolean): boolean {
  if (!filter) {
    return true
  }

  const expected = caseSensitive ? normalizeJsonValue(filter.value) : normalizeCaseInsensitiveValue(filter.value)
  return valuePathMatchesAtFieldPath(record, filter.field_path).some((match) => {
    const actual = caseSensitive ? normalizeJsonValue(match.value) : normalizeCaseInsensitiveValue(match.value)
    return JSON.stringify(actual) === JSON.stringify(expected)
  })
}

function normalizeCaseInsensitiveValue(value: unknown): unknown {
  return typeof value === 'string' ? value.toLowerCase() : normalizeJsonValue(value)
}

function buildMockValuesGroups(request: ValuesAnalysisRequest): ValuesGroup[] {
  const groups: MockValuesGroupAccumulator[] = []

  parity.shared_dataset.records.forEach((record, recordIndex) => {
    const perFieldMatches = request.selected_fields.map((fieldPath) => valuePathMatchesAtFieldPath(record, fieldPath))
    if (perFieldMatches.some((matches) => matches.length === 0)) {
      return
    }

    for (const combination of cartesianValueMatches(perFieldMatches)) {
      const key = combination.map((match) => normalizeJsonValue(match.value))
      const identity = key.map((value) => `${typeHintForValue(value)}:${JSON.stringify(value)}`).join('|')
      const displayValue = key.map(displayMockValue).join(' | ')
      const sourcePaths = combination.map((match) => recordSourcePath(recordIndex, match.sourcePath))
      const existing = groups.find((group) => group.identity === identity)

      if (existing) {
        existing.count += 1
        existing.source_paths.push(...sourcePaths)
        if (!existing.record_indexes.includes(recordIndex)) {
          existing.record_indexes.push(recordIndex)
        }
        if (request.include_parent_items && !existing.parent_items.some((item) => item.record_index === recordIndex)) {
          existing.parent_items.push(parentItemForMockRecord(record, recordIndex, request.selected_fields))
        }
        continue
      }

      groups.push({
        identity,
        firstSourcePath: sourcePaths[0] ?? '',
        key,
        display_value: displayValue,
        count: 1,
        source_paths: sourcePaths,
        record_indexes: [recordIndex],
        parent_items: request.include_parent_items ? [parentItemForMockRecord(record, recordIndex, request.selected_fields)] : [],
      })
    }
  })

  const search = request.search?.trim().toLowerCase()
  const filteredGroups = search
    ? groups.filter((group) => `${group.display_value} ${group.key.map(displayMockValue).join(' ')}`.toLowerCase().includes(search))
    : groups

  filteredGroups.sort((left, right) => {
    let primary = 0
    switch (request.sort.by) {
      case 'count':
        primary = left.count - right.count
        break
      case 'value':
        primary = left.display_value.localeCompare(right.display_value)
        break
      case 'first_source_path':
        primary = left.firstSourcePath.localeCompare(right.firstSourcePath)
        break
    }

    if (request.sort.direction === 'desc') {
      primary *= -1
    }

    return primary || left.display_value.localeCompare(right.display_value) || left.firstSourcePath.localeCompare(right.firstSourcePath)
  })

  return filteredGroups.map((group) => ({
    key: group.key,
    display_value: group.display_value,
    count: group.count,
    source_paths: group.source_paths,
    record_indexes: group.record_indexes,
    parent_items: group.parent_items,
  }))
}

function buildMockValuesExplorerGroups(request: ValuesExplorerAnalysisRequest): ValuesExplorerGroup[] {
  const grouped = buildMockValuesGroups({
    json_string: request.json_string,
    selected_fields: request.selected_fields,
    search: null,
    sort: request.sort_mode === 'alphabetical' ? { by: 'value', direction: 'asc' } : { by: 'count', direction: 'desc' },
    page: 1,
    page_size: mockConfig().limits.values_explorer.max_page_size,
    include_parent_items: true,
    flatten: request.flatten,
  })

  const filteredGroups = request.filter
    ? grouped
      .map((group) => ({
        ...group,
        parent_items: group.parent_items.filter((item) => mockRecordMatchesExplorerFilter(item.record_index, request.filter)),
      }))
      .filter((group) => group.parent_items.length > 0)
      .map((group) => ({
        ...group,
        count: group.parent_items.length,
        record_indexes: group.parent_items.map((item) => item.record_index),
      }))
    : grouped

  return filteredGroups.map((group) => ({
    value: group.key.length === 1 ? group.key[0] : group.key,
    display_value: group.display_value,
    count: group.count,
    is_duplicate: group.count > 1,
    items: group.parent_items.map((item) => ({
      index: item.record_index,
      item: item.summary,
      source_path: item.source_path,
      field_value: group.key.length === 1 ? group.key[0] : group.key,
    })),
  }))
}

function mockRecordMatchesExplorerFilter(recordIndex: number, filter: ValuesExplorerAnalysisRequest['filter']): boolean {
  if (!filter) {
    return true
  }

  const record = parity.shared_dataset.records[recordIndex]
  const values = valuePathMatchesAtFieldPath(record, filter.field_path).map((match) => displayMockValue(normalizeJsonValue(match.value)))
  const needle = filter.case_sensitive ? filter.value : filter.value.toLowerCase()

  return values.some((value) => {
    const haystack = filter.case_sensitive ? value : value.toLowerCase()
    return filter.match_mode === 'exact' ? haystack === needle : haystack.includes(needle)
  })
}

function cartesianValueMatches(matchesByField: ValuePathMatch[][]): ValuePathMatch[][] {
  return matchesByField.reduce<ValuePathMatch[][]>(
    (combinations, matches) => combinations.flatMap((combination) => matches.map((match) => [...combination, match])),
    [[]],
  )
}

function valuePathMatchesAtFieldPath(record: unknown, fieldPath: string): ValuePathMatch[] {
  const parts = fieldPath.replace(/^\[\]\.?/, '').split('.').filter(Boolean)
  let currentValues: ValuePathMatch[] = [{ value: record, sourcePath: '' }]

  for (const part of parts) {
    const nextValues: ValuePathMatch[] = []
    for (const current of currentValues) {
      if (part === '[]') {
        if (Array.isArray(current.value)) {
          current.value.forEach((item, index) => {
            nextValues.push({ value: item, sourcePath: appendMockPath(current.sourcePath, String(index)) })
          })
        }
        continue
      }

      if (typeof current.value === 'object' && current.value !== null && Object.prototype.hasOwnProperty.call(current.value, part)) {
        nextValues.push({
          value: (current.value as Record<string, unknown>)[part],
          sourcePath: appendMockPath(current.sourcePath, part),
        })
      }
    }
    currentValues = nextValues
  }

  return currentValues
}

function parentItemForMockRecord(record: unknown, recordIndex: number, selectedFields: string[]): ValuesGroup['parent_items'][number] {
  const summary: Record<string, unknown> = {}
  if (typeof record === 'object' && record !== null) {
    const objectRecord = record as Record<string, unknown>
    for (const key of ['id', 'name']) {
      if (isMockSummaryValue(objectRecord[key])) {
        summary[key] = objectRecord[key]
      }
    }
    for (const fieldPath of selectedFields) {
      const firstSegment = fieldPath.replace(/^\[\]\.?/, '').split('.')[0]
      if (firstSegment && !(firstSegment in summary) && isMockSummaryValue(objectRecord[firstSegment])) {
        summary[firstSegment] = objectRecord[firstSegment]
      }
    }
  }

  return { record_index: recordIndex, source_path: String(recordIndex), summary }
}

function isMockSummaryValue(value: unknown): boolean {
  return value === null || ['string', 'number', 'boolean'].includes(typeof value)
}

function normalizeJsonValue(value: unknown): unknown {
  return value === undefined ? null : value
}

function displayMockValue(value: unknown): string {
  if (value === null) {
    return 'null'
  }
  if (typeof value === 'string') {
    return value
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  return JSON.stringify(value)
}

function recordSourcePath(recordIndex: number, sourcePath: string): string {
  return sourcePath ? `${recordIndex}.${sourcePath}` : String(recordIndex)
}

function appendMockPath(base: string, segment: string): string {
  return base ? `${base}.${segment}` : segment
}


function fixtureFields(): FieldPattern[] {
  return Object.values(fixtures.field_paths_patterns.expected_field_patterns_subset)
}

function fixtureStructure(parsed: unknown): StructureAnalysis {
  const flattenedPaths = Object.keys(fixtures.field_paths_patterns.expected_flattened)
  const valueType = Array.isArray(parsed) ? 'list' : typeof parsed === 'object' && parsed !== null ? 'dict' : typeof parsed
  const size = Array.isArray(parsed)
    ? parsed.length
    : typeof parsed === 'object' && parsed !== null
      ? Object.keys(parsed).length
      : 1
  const isListOfLists = Array.isArray(parsed) && parsed.every((item) => Array.isArray(item))
  const flattenedOneLevelItems = isListOfLists
    ? parsed.reduce((count, item) => count + (item as unknown[]).length, 0)
    : 0

  return {
    type: valueType,
    size,
    depth: 4,
    field_paths: flattenedPaths,
    field_count: flattenedPaths.length,
    schema: objectSchema([
      { name: 'users', schema: arraySchema(objectSchema([]), 3) },
      { name: 'metadata', schema: objectSchema([]) },
    ]),
    top_level_size: size,
    total_items: isListOfLists ? flattenedOneLevelItems : size,
    container_summary: {
      type: valueType,
      is_list_of_lists: isListOfLists,
      inner_arrays: isListOfLists ? parsed.length : 0,
      empty_inner_arrays: isListOfLists
        ? parsed.filter((item) => Array.isArray(item) && item.length === 0).length
        : 0,
      flattened_one_level_items: flattenedOneLevelItems,
    },
  }
}

function fixtureStatistics(): StatisticsAnalysis {
  const expected = fixtures.structure_statistics.expected_source_statistics
  return {
    total_fields: expected.total_fields,
    type_distribution: Object.entries(expected.type_distribution).map(([type, count]) => ({
      type,
      count,
    })),
    null_count: expected.null_count,
    string_length_stats: expected.string_length_stats,
    field_value_distribution: Object.entries(expected.field_value_distribution).map(([path, values]) => ({
      path,
      values: Object.entries(values).map(([value, count]) => ({ value, count })),
    })),
    unique_field_paths: expected.unique_field_paths,
  }
}

function mockValuesFields(): ValuesFieldDiscoveryResponse['fields'] {
  return parity.shared_dataset.field_patterns.map((fieldPath) => fieldInfoFromRecords(fieldPath))
}

function fieldInfoFromRecords(fieldPath: string): ValuesFieldDiscoveryResponse['fields'][number] {
  const values: unknown[] = []
  let missingCount = 0
  let nullCount = 0

  for (const record of parity.shared_dataset.records) {
    const recordValues = valuesAtFieldPath(record, fieldPath)
    if (recordValues.length === 0) {
      missingCount += 1
      continue
    }

    for (const value of recordValues) {
      if (value === null) {
        nullCount += 1
      } else {
        values.push(value)
      }
    }
  }

  const uniqueValues = uniqueUnknown(values)
  return {
    field_path: fieldPath,
    label: labelForFieldPath(fieldPath),
    type_hints: uniqueValues.length === 0 ? [] : uniqueValues.map(typeHintForValue).filter(uniqueString),
    non_null_count: values.length,
    null_count: nullCount,
    missing_count: missingCount,
    unique_value_count: uniqueValues.length,
    sample_values: uniqueValues.slice(0, 3),
  }
}

function valuesAtFieldPath(record: unknown, fieldPath: string): unknown[] {
  const parts = fieldPath.replace(/^\[\]\.?/, '').split('.').filter(Boolean)
  let currentValues: unknown[] = [record]

  for (const part of parts) {
    const nextValues: unknown[] = []
    for (const current of currentValues) {
      if (part === '[]') {
        if (Array.isArray(current)) {
          nextValues.push(...current)
        }
        continue
      }

      if (typeof current === 'object' && current !== null && part in current) {
        nextValues.push((current as Record<string, unknown>)[part])
      }
    }
    currentValues = nextValues
  }

  return currentValues
}

function labelForFieldPath(fieldPath: string): string {
  const pathParts = fieldPath.split('.').filter((part) => part !== '[]')
  const lastPart = pathParts[pathParts.length - 1]?.replace(/^\[\]/, '') || fieldPath
  return lastPart
    .split(/[_-]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function uniqueUnknown(values: unknown[]): unknown[] {
  const seen = new Set<string>()
  const uniqueValues: unknown[] = []
  for (const value of values) {
    const key = JSON.stringify(value)
    if (!seen.has(key)) {
      seen.add(key)
      uniqueValues.push(value)
    }
  }
  return uniqueValues
}

function uniqueString(value: string, index: number, values: string[]): boolean {
  return values.indexOf(value) === index
}

function typeHintForValue(value: unknown): string {
  if (Array.isArray(value)) {
    return 'list'
  }

  if (value === null) {
    return 'null'
  }

  switch (typeof value) {
    case 'string':
      return 'str'
    case 'number':
      return 'number'
    case 'boolean':
      return 'bool'
    case 'object':
      return 'dict'
    default:
      return typeof value
  }
}

function fixtureExactDuplicates(): ExactDuplicatesResult {
  const expected = fixtures.exact_duplicates.expected_source_legacy
  return {
    total_items: expected.total_items,
    unique_items: expected.unique_items,
    duplicate_groups: expected.duplicate_groups,
    duplicates: Object.entries(expected.duplicates).map(([value, indexes]) => ({
      value: compactJsonString(value),
      indexes,
    })),
    has_duplicates: expected.has_duplicates,
    analysis_path: expected.analysis_path,
  }
}

function fixtureMinMax(deep: boolean): MinMaxFilledResult {
  const expected = deep
    ? fixtures.min_max_filled.expected_deep_true_summary
    : fixtures.min_max_filled.expected_deep_false_summary
  return {
    analysis_path: expected.analysis_path,
    total_records: expected.total_records,
    min_records: [expected.min_record],
    max_records: [expected.max_record],
    statistics: {
      total_records: expected.statistics.total_records,
      avg_filled_fields: expected.statistics.avg_filled_fields,
      median_filled_fields: expected.statistics.median_filled_fields,
      std_filled_fields: expected.statistics.std_filled_fields,
      avg_completeness_pct: expected.statistics.avg_completeness_pct,
      field_count_distribution: Object.entries(expected.statistics.field_count_distribution).map(
        ([filled_count, count]) => ({ filled_count: Number(filled_count), count }),
      ),
    },
    has_records: expected.has_records,
  }
}

function objectSchema(properties: { name: string; schema: SchemaNode }[]): SchemaNode {
  return { type: 'object', properties, items: null, one_of: [], length: null }
}

function arraySchema(items: SchemaNode, length: number): SchemaNode {
  return { type: 'array', properties: [], items, one_of: [], length }
}

function safeParseJson(input: string): unknown {
  try {
    return JSON.parse(input) as unknown
  } catch {
    return fixtures.field_paths_patterns.input_data
  }
}

function mayContainDuplicateObjectKeys(input: string): boolean {
  return /"([^"\\]*(?:\\.[^"\\]*)*)"\s*:.*"\1"\s*:/s.test(input)
}

function flattenOneLevelIfListOfLists(input: unknown, shouldFlatten: boolean): unknown {
  if (!shouldFlatten || !Array.isArray(input) || input.length === 0 || !input.every((item) => Array.isArray(item))) {
    return input
  }

  return input.flatMap((item) => item as unknown[])
}

function compactJsonString(value: string): string {
  try {
    return JSON.stringify(JSON.parse(value) as unknown)
  } catch {
    return value
  }
}
