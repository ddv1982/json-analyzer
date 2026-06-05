import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  analyzeValuesExplorer,
  discoverValuesFields,
  getConfig,
  normalizeCommandError,
  type AppConfig,
  type ProblemDetails,
  type ValuesExplorerAnalysisResponse,
  type ValuesExplorerFilter,
  type ValuesExplorerGroup,
  type ValuesExplorerSortMode,
  type ValuesFieldInfo,
} from '../../../lib/commands'
import { useClipboardCopy } from '../../../lib/clipboard'
import { formatInteger } from '../../common/format'
import { MultiSelectDropdown, type MultiSelectOption } from '../../common/MultiSelectDropdown'

const FALLBACK_VALUES_EXPLORER_LIMITS: AppConfig['limits']['values_explorer'] = {
  max_selected_fields: 5,
  default_page_size: 25,
  page_sizes: [10, 25, 50, 100],
  max_page_size: 100,
  max_parent_items_per_group: 100,
  max_match_combinations_per_record: 10_000,
  max_match_combinations_per_request: 100_000,
}

const FILTER_INPUT_DEBOUNCE_MS = 250
const DEFAULT_SORT_MODE: ValuesExplorerSortMode = 'frequency'

type ValuesSectionKey = 'duplicates' | 'all'
type ExpandedGroupsState = Record<ValuesSectionKey, string[]>

const EMPTY_EXPANDED_GROUPS: ExpandedGroupsState = { duplicates: [], all: [] }

export function ValuesExplorerView({
  jsonInput,
  flattenNestedArrays,
}: {
  jsonInput: string
  flattenNestedArrays: boolean
}) {
  const [isCollapsed, setIsCollapsed] = useState(true)
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [isConfigLoaded, setIsConfigLoaded] = useState(false)
  const [fields, setFields] = useState<ValuesFieldInfo[]>([])
  const [knownFieldsByPath, setKnownFieldsByPath] = useState<Record<string, ValuesFieldInfo>>({})
  const [fieldSearch, setFieldSearch] = useState('')
  const [selectedFields, setSelectedFields] = useState<string[]>([])
  const [draftFilterField, setDraftFilterField] = useState('')
  const [draftFilterValue, setDraftFilterValue] = useState('')
  const [effectiveFilter, setEffectiveFilter] = useState<ValuesExplorerFilter | null>(null)
  const [sortMode, setSortMode] = useState<ValuesExplorerSortMode>(DEFAULT_SORT_MODE)
  const [duplicatePage, setDuplicatePage] = useState(1)
  const [groupsPage, setGroupsPage] = useState(1)
  const [pageSize, setPageSize] = useState(FALLBACK_VALUES_EXPLORER_LIMITS.default_page_size)
  const [result, setResult] = useState<ValuesExplorerAnalysisResponse | null>(null)
  const [discoveryError, setDiscoveryError] = useState<ProblemDetails | null>(null)
  const [analysisError, setAnalysisError] = useState<ProblemDetails | null>(null)
  const [isDiscovering, setIsDiscovering] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [selectionLimitMessage, setSelectionLimitMessage] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [expandedGroups, setExpandedGroups] = useState<ExpandedGroupsState>(EMPTY_EXPANDED_GROUPS)
  const discoveryRequestIdRef = useRef(0)
  const analysisRequestIdRef = useRef(0)
  const filterDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { copiedKey, errorKey, errorMessage, copy } = useClipboardCopy(1800)

  const valuesLimits = config?.limits.values_explorer ?? FALLBACK_VALUES_EXPLORER_LIMITS
  const valuesExplorerDisabled = isConfigLoaded && config?.features.values_explorer === false
  const canUseValuesExplorer = isConfigLoaded && !valuesExplorerDisabled
  const maxSelectedFields = valuesLimits.max_selected_fields
  const pageSizes = valuesLimits.page_sizes.length > 0 ? valuesLimits.page_sizes : FALLBACK_VALUES_EXPLORER_LIMITS.page_sizes
  const fieldOptions = useMemo<MultiSelectOption[]>(
    () => fields.map((field) => ({
      value: field.field_path,
      label: field.label,
      description: field.field_path,
      metadata: [`${formatInteger(field.unique_value_count)} unique`, `${formatInteger(field.non_null_count)} filled`],
    })),
    [fields],
  )

  useEffect(() => {
    let canceled = false
    getConfig()
      .then((response) => {
        if (!canceled) {
          setConfig(response.config)
          setPageSize(response.config.limits.values_explorer.default_page_size)
          setIsConfigLoaded(true)
        }
      })
      .catch(() => {
        if (!canceled) {
          setConfig(null)
          setIsConfigLoaded(true)
        }
      })

    return () => {
      canceled = true
    }
  }, [])

  useEffect(() => {
    analysisRequestIdRef.current += 1
    setIsCollapsed(true)
    setSelectedFields([])
    setDraftFilterField('')
    setDraftFilterValue('')
    setEffectiveFilter(null)
    setSortMode(DEFAULT_SORT_MODE)
    setDuplicatePage(1)
    setGroupsPage(1)
    setResult(null)
    setAnalysisError(null)
    setIsAnalyzing(false)
    setExpandedGroups(EMPTY_EXPANDED_GROUPS)
  }, [jsonInput, flattenNestedArrays])

  useEffect(() => {
    const requestId = discoveryRequestIdRef.current + 1
    discoveryRequestIdRef.current = requestId

    if (!canUseValuesExplorer) {
      setFields([])
      setKnownFieldsByPath({})
      setDiscoveryError(null)
      setIsDiscovering(false)
      return
    }

    setIsDiscovering(true)
    setDiscoveryError(null)

    discoverValuesFields({
      json_string: jsonInput,
      search: fieldSearch.trim() || null,
      limit: null,
      flatten: flattenNestedArrays,
    })
      .then((response) => {
        if (discoveryRequestIdRef.current !== requestId) {
          return
        }
        setFields(response.fields)
        setKnownFieldsByPath((current) => {
          const next = { ...current }
          for (const field of response.fields) {
            next[field.field_path] = field
          }
          return next
        })
      })
      .catch((unknownError: unknown) => {
        if (discoveryRequestIdRef.current === requestId) {
          setFields([])
          setDiscoveryError(normalizeCommandError(unknownError))
        }
      })
      .finally(() => {
        if (discoveryRequestIdRef.current === requestId) {
          setIsDiscovering(false)
        }
      })
  }, [canUseValuesExplorer, fieldSearch, flattenNestedArrays, jsonInput])

  useEffect(() => () => {
    if (filterDebounceRef.current) {
      clearTimeout(filterDebounceRef.current)
    }
  }, [])

  function runAnalysis(next: {
    fields?: string[]
    filter?: ValuesExplorerFilter | null
    sort?: ValuesExplorerSortMode
    duplicatePage?: number
    groupsPage?: number
    pageSize?: number
  }) {
    const nextFields = next.fields ?? selectedFields
    const nextFilter = next.filter === undefined ? effectiveFilter : next.filter
    const nextSort = next.sort ?? sortMode
    const nextDuplicatePage = next.duplicatePage ?? duplicatePage
    const nextGroupsPage = next.groupsPage ?? groupsPage
    const nextPageSize = Math.min(next.pageSize ?? pageSize, valuesLimits.max_page_size)

    if (!canUseValuesExplorer || nextFields.length === 0 || nextFields.length > maxSelectedFields) {
      analysisRequestIdRef.current += 1
      setResult(null)
      setAnalysisError(null)
      setIsAnalyzing(false)
      setExpandedGroups(EMPTY_EXPANDED_GROUPS)
      return
    }

    const requestId = analysisRequestIdRef.current + 1
    analysisRequestIdRef.current = requestId
    setIsAnalyzing(true)
    setAnalysisError(null)
    setResult(null)
    setExpandedGroups(EMPTY_EXPANDED_GROUPS)

    analyzeValuesExplorer({
      json_string: jsonInput,
      selected_fields: nextFields,
      filter: nextFilter,
      sort_mode: nextSort,
      page: nextDuplicatePage,
      groups_page: nextGroupsPage,
      page_size: nextPageSize,
      flatten: flattenNestedArrays,
    })
      .then((response) => {
        if (analysisRequestIdRef.current === requestId) {
          setResult(response)
          setDuplicatePage(response.page)
          setGroupsPage(response.groups_page)
          setPageSize(response.page_size)
          setEffectiveFilter(response.filter ?? nextFilter)
        }
      })
      .catch((unknownError: unknown) => {
        if (analysisRequestIdRef.current === requestId) {
          setResult(null)
          setAnalysisError(normalizeCommandError(unknownError))
        }
      })
      .finally(() => {
        if (analysisRequestIdRef.current === requestId) {
          setIsAnalyzing(false)
        }
      })
  }

  function handleSelectedFieldsChange(nextSelectedFields: string[]) {
    setSelectionLimitMessage(null)
    setActionMessage(null)
    if (nextSelectedFields.length > maxSelectedFields) {
      setSelectionLimitMessage(`Maximum of ${maxSelectedFields} fields can be selected at once.`)
      return
    }
    setSelectedFields(nextSelectedFields)
    setDuplicatePage(1)
    setGroupsPage(1)
    if (nextSelectedFields.length === 0) {
      analysisRequestIdRef.current += 1
      setResult(null)
      setAnalysisError(null)
      setEffectiveFilter(null)
      setIsAnalyzing(false)
      setExpandedGroups(EMPTY_EXPANDED_GROUPS)
      return
    }
    runAnalysis({ fields: nextSelectedFields, duplicatePage: 1, groupsPage: 1 })
  }

  function handleSelectionLimit(maximumFields: number) {
    setSelectionLimitMessage(`Maximum of ${maximumFields} fields can be selected at once.`)
  }

  function activeDraftFilter(field = draftFilterField, value = draftFilterValue): ValuesExplorerFilter | null {
    const normalizedField = field.trim()
    const normalizedValue = value.trim()
    if (!normalizedField || !normalizedValue) {
      return null
    }
    return {
      field_path: normalizedField,
      value: normalizedValue,
      match_mode: 'contains',
      case_sensitive: false,
    }
  }

  function changeFilterField(field: string) {
    if (filterDebounceRef.current) {
      clearTimeout(filterDebounceRef.current)
      filterDebounceRef.current = null
    }
    setDraftFilterField(field)
    setDuplicatePage(1)
    setGroupsPage(1)
    const nextFilter = activeDraftFilter(field, draftFilterValue)
    setEffectiveFilter(nextFilter)
    runAnalysis({ filter: nextFilter, duplicatePage: 1, groupsPage: 1 })
  }

  function changeFilterValue(value: string) {
    setDraftFilterValue(value)
    setDuplicatePage(1)
    setGroupsPage(1)
    if (filterDebounceRef.current) {
      clearTimeout(filterDebounceRef.current)
    }
    filterDebounceRef.current = setTimeout(() => {
      const nextFilter = activeDraftFilter(draftFilterField, value)
      setEffectiveFilter(nextFilter)
      runAnalysis({ filter: nextFilter, duplicatePage: 1, groupsPage: 1 })
      filterDebounceRef.current = null
    }, FILTER_INPUT_DEBOUNCE_MS)
  }

  function clearFilter() {
    if (filterDebounceRef.current) {
      clearTimeout(filterDebounceRef.current)
      filterDebounceRef.current = null
    }
    setDraftFilterField('')
    setDraftFilterValue('')
    setEffectiveFilter(null)
    setDuplicatePage(1)
    setGroupsPage(1)
    runAnalysis({ filter: null, duplicatePage: 1, groupsPage: 1 })
  }

  function changeSort(nextSort: ValuesExplorerSortMode) {
    setSortMode(nextSort)
    setDuplicatePage(1)
    setGroupsPage(1)
    runAnalysis({ sort: nextSort, duplicatePage: 1, groupsPage: 1 })
  }

  function changeDuplicatePage(nextPage: number) {
    const normalizedPage = Math.max(1, nextPage)
    setDuplicatePage(normalizedPage)
    runAnalysis({ duplicatePage: normalizedPage })
  }

  function changeGroupsPage(nextPage: number) {
    const normalizedPage = Math.max(1, nextPage)
    setGroupsPage(normalizedPage)
    runAnalysis({ groupsPage: normalizedPage })
  }

  function changePageSize(nextPageSize: number) {
    setPageSize(nextPageSize)
    setDuplicatePage(1)
    setGroupsPage(1)
    runAnalysis({ duplicatePage: 1, groupsPage: 1, pageSize: nextPageSize })
  }

  function clearResults() {
    analysisRequestIdRef.current += 1
    setSelectedFields([])
    setDraftFilterField('')
    setDraftFilterValue('')
    setEffectiveFilter(null)
    setSortMode(DEFAULT_SORT_MODE)
    setDuplicatePage(1)
    setGroupsPage(1)
    setResult(null)
    setAnalysisError(null)
    setIsAnalyzing(false)
    setExpandedGroups(EMPTY_EXPANDED_GROUPS)
    setActionMessage('Values results cleared.')
  }

  async function copyGroupItems(group: ValuesExplorerGroup, sectionKey: ValuesSectionKey) {
    await copy(group.items.map((item) => JSON.stringify(item.item, null, 2)).join('\n'), valueGroupCopyKey(sectionKey, group))
  }

  function toggleGroup(sectionKey: ValuesSectionKey, group: ValuesExplorerGroup) {
    const id = valueGroupId(group)
    setExpandedGroups((current) => {
      const sectionIds = current[sectionKey]
      return {
        ...current,
        [sectionKey]: sectionIds.includes(id) ? sectionIds.filter((currentId) => currentId !== id) : [...sectionIds, id],
      }
    })
  }

  function expandSection(sectionKey: ValuesSectionKey, groups: ValuesExplorerGroup[]) {
    setExpandedGroups((current) => ({ ...current, [sectionKey]: groups.map(valueGroupId) }))
  }

  function collapseSection(sectionKey: ValuesSectionKey) {
    setExpandedGroups((current) => ({ ...current, [sectionKey]: [] }))
  }

  if (!isConfigLoaded) {
    return <ValuesStateCard title="Loading Values Explorer configuration..." body="Checking whether Values Explorer is available." />
  }

  if (valuesExplorerDisabled) {
    return <ValuesStateCard title="Values Explorer disabled" body="Values Explorer is disabled by configuration." />
  }

  return (
    <section className="values-explorer" aria-label="Values Explorer view">
      <div className="result-card values-explorer-card">
        <div className="result-card-heading values-explorer-heading">
          <div className="values-title-group">
            <h3>
              <span className="values-title-icon" aria-hidden="true"><CopyGlyph /></span>
              Values Explorer
            </h3>
          </div>
          <button
            type="button"
            className="values-card-toggle icon-only-button"
            aria-expanded={!isCollapsed}
            aria-controls="values-explorer-body"
            aria-label={isCollapsed ? 'Expand' : 'Collapse'}
            onClick={() => setIsCollapsed((current) => !current)}
          >
            {isCollapsed ? <ChevronDownGlyph /> : <ChevronUpGlyph />}
          </button>
        </div>

        {errorMessage ? <p className="input-help warning-text values-header-error" role="status">{errorMessage}</p> : null}
        {discoveryError ? <InlineProblem error={discoveryError} /> : null}
        {analysisError ? <InlineProblem error={analysisError} /> : null}

        {!isCollapsed ? (
          <div className="values-explorer-body" id="values-explorer-body">
            <div className="field-picker values-field-picker" aria-label="Values field picker">
              <MultiSelectDropdown
                id="values-field-picker"
                label="Select field to analyze for unique and duplicate values"
                options={fieldOptions}
                value={selectedFields}
                onChange={handleSelectedFieldsChange}
                maxSelected={maxSelectedFields}
                placeholder="Choose one or more fields..."
                searchPlaceholder="Search fields..."
                searchValue={fieldSearch}
                onSearchChange={setFieldSearch}
                onSelectionLimit={handleSelectionLimit}
                loading={isDiscovering}
                emptyMessage="No value fields found."
                showSearch={false}
              />
              {selectedFields.length >= maxSelectedFields ? <p className="input-help">Maximum of {formatInteger(maxSelectedFields)} fields can be selected at once.</p> : null}
              <p className="input-help values-field-helper">Available fields are automatically detected from your JSON structure</p>
              {selectionLimitMessage ? <p className="input-help warning-text">{selectionLimitMessage}</p> : null}
              {actionMessage ? <p className="input-help" role="status">{actionMessage}</p> : null}
            </div>

            <FilterControls
              options={fields}
              selectedField={draftFilterField}
              value={draftFilterValue}
              onFieldChange={changeFilterField}
              onValueChange={changeFilterValue}
              onClear={clearFilter}
            />

            {selectedFields.length > 0 ? (
              <div className="values-sort-row">
                <label>
                  <span>Sort values by</span>
                  <select value={sortMode} onChange={(event) => changeSort(event.target.value as ValuesExplorerSortMode)}>
                    <option value="frequency">Frequency</option>
                    <option value="alphabetical">Alphabetical</option>
                  </select>
                </label>
              </div>
            ) : null}

            {selectedFields.length === 0 ? (
              <div className="values-empty-selection">
                Select one or more fields to analyze duplicate combinations.
              </div>
            ) : null}

            {isAnalyzing && !result ? <p className="muted" role="status">Loading values...</p> : null}

            {result ? (
              <div className="values-results-shell">
                <ResultsSummary
                  result={result}
                  selectedFields={selectedFields.map((fieldPath) => knownFieldsByPath[fieldPath] ?? fields.find((field) => field.field_path === fieldPath) ?? fieldSummaryFallback(fieldPath))}
                  appliedFilterField={fields.find((field) => field.field_path === effectiveFilter?.field_path)?.label ?? effectiveFilter?.field_path ?? null}
                />
                <ResultsPanels
                  result={result}
                  copiedKey={copiedKey}
                  errorKey={errorKey}
                  expandedGroups={expandedGroups}
                  pageSizes={pageSizes}
                  onCopyGroup={(group, sectionKey) => { void copyGroupItems(group, sectionKey) }}
                  onToggleGroup={toggleGroup}
                  onExpandAll={expandSection}
                  onCollapseAll={collapseSection}
                  onDuplicatePageChange={changeDuplicatePage}
                  onGroupsPageChange={changeGroupsPage}
                  onPageSizeChange={changePageSize}
                />
              </div>
            ) : null}

            {selectedFields.length > 0 ? (
              <div className="values-footer-actions">
                {result && result.duplicate_group_count > 0 ? (
                  <button type="button" disabled={!config?.features.pdf_export} onClick={() => setActionMessage('PDF export is not available in this build.')}>
                    Export PDF
                  </button>
                ) : null}
                <button type="button" onClick={clearResults}>Clear Results</button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  )
}

function ValuesStateCard({ title, body }: { title: string; body: string }) {
  return (
    <section className="values-explorer" aria-label="Values Explorer view">
      <div className="state-card" role="status">
        <strong>{title}</strong>
        <span>{body}</span>
      </div>
    </section>
  )
}

function FilterControls({
  options,
  selectedField,
  value,
  onFieldChange,
  onValueChange,
  onClear,
}: {
  options: ValuesFieldInfo[]
  selectedField: string
  value: string
  onFieldChange: (field: string) => void
  onValueChange: (value: string) => void
  onClear: () => void
}) {
  if (options.length === 0) {
    return null
  }

  return (
    <div className="values-filter-controls" aria-label="Values filter controls">
      <label>
        <span>Filter field</span>
        <select value={selectedField || '__none__'} onChange={(event) => onFieldChange(event.target.value === '__none__' ? '' : event.target.value)}>
          <option value="__none__">No filter field</option>
          {options.map((field) => <option key={field.field_path} value={field.field_path}>{field.label}</option>)}
        </select>
      </label>
      <label>
        <span>Filter value</span>
        <input
          className="text-input"
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          placeholder="Type a value to filter records..."
          disabled={!selectedField}
        />
      </label>
      <button type="button" onClick={onClear} disabled={!selectedField && !value}>Clear Filter</button>
    </div>
  )
}

function ResultsSummary({
  result,
  selectedFields,
  appliedFilterField,
}: {
  result: ValuesExplorerAnalysisResponse
  selectedFields: ValuesFieldInfo[]
  appliedFilterField: string | null
}) {
  return (
    <div className="values-summary-stack">
      <div>
        <p className="values-summary-title">{result.is_composite ? 'Composite Field Combination' : 'Field Analysis'}</p>
        <div className="selected-field-chip-list">
          {selectedFields.map((field) => <code key={field.field_path} className="selected-field-chip">{field.label}</code>)}
        </div>
        {appliedFilterField && result.filter ? (
          <p className="input-help">Filtered by <strong>{appliedFilterField}</strong>: <code>{result.filter.value}</code></p>
        ) : null}
      </div>
      <div className="values-summary" aria-label="Values results summary">
        <SummaryMetric label="Total Records" value={formatInteger(result.total_items)} />
        <SummaryMetric label="Unique results" value={formatInteger(result.unique_values)} tone="info" />
        <SummaryMetric
          label="Duplicate results"
          value={(
            <>
              {formatInteger(result.duplicate_group_count)}
              {result.duplicate_group_count > 0 ? (
                <span>({Math.round((result.duplicate_group_count / Math.max(1, result.unique_values)) * 100)}%)</span>
              ) : null}
            </>
          )}
          tone="danger"
        />
        <SummaryMetric label="Field Set" value={result.field_paths.join(' + ')} compact />
      </div>
      {result.duplicate_group_count > 0 ? (
        <div className="values-duplicate-callout" role="status">
          <WarningGlyph />
          <div>
            <strong>Found {formatInteger(result.duplicate_group_count)} duplicate results</strong>
            <span>The selected field combination appears multiple times in the same record scope.</span>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function SummaryMetric({
  label,
  value,
  tone,
  compact = false,
}: {
  label: string
  value: ReactNode
  tone?: 'info' | 'danger'
  compact?: boolean
}) {
  return (
    <div className={`values-summary-metric${compact ? ' compact' : ''}${tone ? ` ${tone}` : ''}`}>
      <p>{label}</p>
      <strong>{value}</strong>
    </div>
  )
}

function ResultsPanels({
  result,
  copiedKey,
  errorKey,
  expandedGroups,
  pageSizes,
  onCopyGroup,
  onToggleGroup,
  onExpandAll,
  onCollapseAll,
  onDuplicatePageChange,
  onGroupsPageChange,
  onPageSizeChange,
}: {
  result: ValuesExplorerAnalysisResponse
  copiedKey: string | null
  errorKey: string | null
  expandedGroups: ExpandedGroupsState
  pageSizes: number[]
  onCopyGroup: (group: ValuesExplorerGroup, sectionKey: ValuesSectionKey) => void
  onToggleGroup: (sectionKey: ValuesSectionKey, group: ValuesExplorerGroup) => void
  onExpandAll: (sectionKey: ValuesSectionKey, groups: ValuesExplorerGroup[]) => void
  onCollapseAll: (sectionKey: ValuesSectionKey) => void
  onDuplicatePageChange: (page: number) => void
  onGroupsPageChange: (page: number) => void
  onPageSizeChange: (pageSize: number) => void
}) {
  return (
    <>
      {result.duplicate_group_count > 0 ? (
        <ValueGroupsSection
          title={`Duplicate results (${formatInteger(result.duplicate_group_count)})`}
          groups={result.duplicates}
          sectionKey="duplicates"
          copiedKey={copiedKey}
          errorKey={errorKey}
          expandedGroupIds={expandedGroups.duplicates}
          action={result.total_pages > 1 ? (
            <PaginationControls
              page={result.page}
              totalPages={result.total_pages}
              pageSize={result.page_size}
              pageSizes={pageSizes}
              onPageChange={onDuplicatePageChange}
              onPageSizeChange={onPageSizeChange}
            />
          ) : null}
          onCopyGroup={onCopyGroup}
          onToggleGroup={onToggleGroup}
          onExpandAll={onExpandAll}
          onCollapseAll={onCollapseAll}
        />
      ) : (
        <div className="inline-empty-state"><strong>No duplicate results found for this field set.</strong></div>
      )}

      <ValueGroupsSection
        title={`Results (page ${formatInteger(result.groups_page)} of ${formatInteger(result.groups_total_pages)})`}
        groups={result.all_field_values}
        sectionKey="all"
        copiedKey={copiedKey}
        errorKey={errorKey}
        expandedGroupIds={expandedGroups.all}
        action={(
          <PaginationControls
            page={result.groups_page}
            totalPages={result.groups_total_pages}
            pageSize={result.page_size}
            pageSizes={pageSizes}
            onPageChange={onGroupsPageChange}
            onPageSizeChange={onPageSizeChange}
          />
        )}
        onCopyGroup={onCopyGroup}
        onToggleGroup={onToggleGroup}
        onExpandAll={onExpandAll}
        onCollapseAll={onCollapseAll}
      />
    </>
  )
}

function ValueGroupsSection({
  title,
  groups,
  sectionKey,
  copiedKey,
  errorKey,
  expandedGroupIds,
  action,
  onCopyGroup,
  onToggleGroup,
  onExpandAll,
  onCollapseAll,
}: {
  title: string
  groups: ValuesExplorerGroup[]
  sectionKey: ValuesSectionKey
  copiedKey: string | null
  errorKey: string | null
  expandedGroupIds: string[]
  action?: ReactNode
  onCopyGroup: (group: ValuesExplorerGroup, sectionKey: ValuesSectionKey) => void
  onToggleGroup: (sectionKey: ValuesSectionKey, group: ValuesExplorerGroup) => void
  onExpandAll: (sectionKey: ValuesSectionKey, groups: ValuesExplorerGroup[]) => void
  onCollapseAll: (sectionKey: ValuesSectionKey) => void
}) {
  return (
    <section className="value-groups-section" aria-label={title}>
      <div className="value-groups-section-heading">
        <h4>{title}</h4>
        <div className="value-groups-section-actions">
          {action}
          <button type="button" disabled={groups.length === 0} onClick={() => onExpandAll(sectionKey, groups)}>Expand All</button>
          <button type="button" disabled={groups.length === 0} onClick={() => onCollapseAll(sectionKey)}>Collapse All</button>
        </div>
      </div>
      {groups.length === 0 ? (
        <div className="inline-empty-state value-groups-section-empty"><strong>No grouped values found.</strong></div>
      ) : (
        <div className="values-groups-list" role="list" aria-label={`${sectionKey === 'duplicates' ? 'Duplicate value' : 'All value'} groups`}>
          {groups.map((group) => {
            const id = valueGroupId(group)
            const isExpanded = expandedGroupIds.includes(id)
            const copyKey = valueGroupCopyKey(sectionKey, group)
            return (
              <article key={`${sectionKey}-${id}`} className={`value-group-row ${group.is_duplicate ? 'duplicate-value-row' : ''}`} role="listitem">
                <div className="value-group-main">
                  <strong className="value-chip" title={group.display_value}>{formatDisplayValue(group.value, group.display_value)}</strong>
                  <span className="count-context">{formatInteger(group.count)} occurrence{group.count === 1 ? '' : 's'}</span>
                </div>
                <div className="value-group-actions">
                  <button
                    type="button"
                    className="icon-only-button value-group-icon-button"
                    aria-label="Copy group items"
                    disabled={group.items.length === 0}
                    onClick={() => onCopyGroup(group, sectionKey)}
                  >
                    {copiedKey === copyKey ? <CheckGlyph /> : errorKey === copyKey ? '!' : <CopyGlyph />}
                  </button>
                  <button
                    type="button"
                    className="icon-only-button value-group-icon-button"
                    aria-expanded={isExpanded}
                    aria-controls={isExpanded ? `values-${sectionKey}-details-${id}` : undefined}
                    aria-label={`${isExpanded ? 'Collapse' : 'Expand'} group`}
                    onClick={() => onToggleGroup(sectionKey, group)}
                  >
                    {isExpanded ? <ChevronUpGlyph /> : <ChevronDownGlyph />}
                  </button>
                </div>
                {isExpanded ? (
                  <div className="value-group-details" id={`values-${sectionKey}-details-${id}`}>
                    {group.items.map((item) => (
                      <div key={`${item.index}-${item.source_path ?? 'source'}`} className="value-record-card">
                        <span className="record-index-badge">Index: {item.index}</span>
                        <pre className="parent-json-preview">{JSON.stringify(item.item, null, 2)}</pre>
                      </div>
                    ))}
                  </div>
                ) : null}
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}

function PaginationControls({
  page,
  totalPages,
  pageSize,
  pageSizes,
  onPageChange,
  onPageSizeChange,
}: {
  page: number
  totalPages: number
  pageSize: number
  pageSizes: number[]
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: number) => void
}) {
  return (
    <div className="values-pagination-controls">
      <select value={pageSize} aria-label="Results per page" onChange={(event) => onPageSizeChange(Number(event.target.value))}>
        {pageSizes.map((size) => <option key={size} value={size}>{size}</option>)}
      </select>
      <button type="button" disabled={page <= 1} aria-label="Previous page" onClick={() => onPageChange(page - 1)}>{'<'}</button>
      <button type="button" disabled={page >= totalPages} aria-label="Next page" onClick={() => onPageChange(page + 1)}>{'>'}</button>
    </div>
  )
}

function InlineProblem({ error }: { error: ProblemDetails }) {
  return (
    <div className="inline-problem" role="alert">
      <strong>{error.title}</strong>
      <span>{error.detail}</span>
    </div>
  )
}

function fieldSummaryFallback(fieldPath: string): ValuesFieldInfo {
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

function formatDisplayValue(value: unknown, fallback: string): string {
  if (value === null || value === undefined || fallback === '') {
    return 'No data'
  }
  return fallback.length > 180 ? `${fallback.slice(0, 177)}...` : fallback
}

function CopyGlyph() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
      <rect x="8" y="8" width="11" height="11" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

function CheckGlyph() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

function ChevronDownGlyph() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

function ChevronUpGlyph() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
      <path d="m18 15-6-6-6 6" />
    </svg>
  )
}

function WarningGlyph() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  )
}

function valueGroupCopyKey(sectionKey: ValuesSectionKey, group: ValuesExplorerGroup) {
  return `values-${sectionKey}-${valueGroupId(group)}`
}

function valueGroupId(group: ValuesExplorerGroup) {
  const identity = JSON.stringify({ value: group.value, display: group.display_value, count: group.count })
  let hash = 5381
  for (let index = 0; index < identity.length; index += 1) {
    hash = ((hash << 5) + hash) ^ identity.charCodeAt(index)
  }
  return (hash >>> 0).toString(36)
}
