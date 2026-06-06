import { useEffect, useMemo, useRef, useState } from 'react'
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
import { ChevronDownGlyph, ChevronUpGlyph, CopyGlyph } from './icons'
import {
  FilterControls,
  InlineProblem,
  ResultsPanels,
  ResultsSummary,
  ValuesStateCard,
} from './ValuesExplorerPanels'
import {
  DEFAULT_SORT_MODE,
  EMPTY_EXPANDED_GROUPS,
  FALLBACK_VALUES_EXPLORER_LIMITS,
  FILTER_INPUT_DEBOUNCE_MS,
  type ExpandedGroupsState,
  type ValuesSectionKey,
} from './types'
import { fieldSummaryFallback, valueGroupCopyKey, valueGroupId } from './utils'

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
