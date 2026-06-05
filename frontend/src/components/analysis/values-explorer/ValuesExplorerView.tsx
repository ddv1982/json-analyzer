import { useEffect, useMemo, useRef, useState } from 'react'
import {
  analyzeValues,
  discoverValuesFields,
  getConfig,
  normalizeCommandError,
  type AppConfig,
  type ParentItem,
  type ProblemDetails,
  type ValuesAnalysisResponse,
  type ValuesFieldInfo,
  type ValuesGroup,
  type ValuesSortBy,
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

const DEFAULT_SORT_BY: ValuesSortBy = 'count'
const DEFAULT_SORT_DIRECTION = 'desc' as const

export function ValuesExplorerView({
  jsonInput,
  flattenNestedArrays,
}: {
  jsonInput: string
  flattenNestedArrays: boolean
}) {
  const [fieldSearch, setFieldSearch] = useState('')
  const [fields, setFields] = useState<ValuesFieldInfo[]>([])
  const [knownFieldsByPath, setKnownFieldsByPath] = useState<Record<string, ValuesFieldInfo>>({})
  const [selectedFields, setSelectedFields] = useState<string[]>([])
  const [valueSearch, setValueSearch] = useState('')
  const [sortBy, setSortBy] = useState<ValuesSortBy>(DEFAULT_SORT_BY)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>(DEFAULT_SORT_DIRECTION)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(FALLBACK_VALUES_EXPLORER_LIMITS.default_page_size)
  const [includeParentItems, setIncludeParentItems] = useState(true)
  const [showDuplicateGroupsOnly, setShowDuplicateGroupsOnly] = useState(false)
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [isConfigLoaded, setIsConfigLoaded] = useState(false)
  const [discoveryError, setDiscoveryError] = useState<ProblemDetails | null>(null)
  const [analysisError, setAnalysisError] = useState<ProblemDetails | null>(null)
  const [isDiscovering, setIsDiscovering] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [valuesResult, setValuesResult] = useState<ValuesAnalysisResponse | null>(null)
  const [selectionLimitMessage, setSelectionLimitMessage] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const { copiedKey, errorKey, errorMessage, copy } = useClipboardCopy(1800)
  const discoveryRequestIdRef = useRef(0)
  const analysisRequestIdRef = useRef(0)
  const knownFieldsRequestKeyRef = useRef(`${jsonInput}\u0000${flattenNestedArrays}`)
  const valuesLimits = config?.limits.values_explorer ?? FALLBACK_VALUES_EXPLORER_LIMITS
  const valuesExplorerDisabled = isConfigLoaded && config?.features.values_explorer === false
  const canUseValuesExplorer = isConfigLoaded && !valuesExplorerDisabled
  const pageSizes = valuesLimits.page_sizes.length > 0 ? valuesLimits.page_sizes : FALLBACK_VALUES_EXPLORER_LIMITS.page_sizes
  const maxSelectedFields = valuesLimits.max_selected_fields
  const valuesPageSize = Math.min(pageSize, valuesLimits.max_page_size)
  const valuesPageSizeClamped = valuesPageSize < pageSize
  const selectionValidationMessage = selectedFields.length > maxSelectedFields ? `Select up to ${maxSelectedFields} fields for one Values Explorer request.` : null

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
    const requestId = discoveryRequestIdRef.current + 1
    const requestKey = `${jsonInput}\u0000${flattenNestedArrays}`
    const resetKnownFields = knownFieldsRequestKeyRef.current !== requestKey
    discoveryRequestIdRef.current = requestId
    knownFieldsRequestKeyRef.current = requestKey
    if (resetKnownFields) {
      setKnownFieldsByPath({})
    }

    if (!canUseValuesExplorer) {
      setFields([])
      setSelectedFields([])
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
          const nextFields: Record<string, ValuesFieldInfo> = resetKnownFields ? {} : { ...current }
          for (const field of response.fields) {
            nextFields[field.field_path] = field
          }
          return nextFields
        })
        setSelectedFields((current) => {
          if (current.length > 0 || response.fields.length === 0) {
            return current
          }
          return [response.fields[0].field_path]
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

  useEffect(() => {
    if (!canUseValuesExplorer || selectedFields.length === 0 || selectedFields.length > maxSelectedFields) {
      analysisRequestIdRef.current += 1
      setValuesResult(null)
      setAnalysisError(null)
      setIsAnalyzing(false)
      return
    }

    const requestId = analysisRequestIdRef.current + 1
    analysisRequestIdRef.current = requestId
    setIsAnalyzing(true)
    setValuesResult(null)
    setAnalysisError(null)

    analyzeValues({
      json_string: jsonInput,
      selected_fields: selectedFields,
      search: valueSearch.trim() || null,
      sort: { by: sortBy, direction: sortDirection },
      page,
      page_size: valuesPageSize,
      include_parent_items: includeParentItems,
      flatten: flattenNestedArrays,
    })
      .then((response) => {
        if (analysisRequestIdRef.current === requestId) {
          setValuesResult(response)
        }
      })
      .catch((unknownError: unknown) => {
        if (analysisRequestIdRef.current === requestId) {
          setValuesResult(null)
          setAnalysisError(normalizeCommandError(unknownError))
        }
      })
      .finally(() => {
        if (analysisRequestIdRef.current === requestId) {
          setIsAnalyzing(false)
        }
      })
  }, [canUseValuesExplorer, flattenNestedArrays, includeParentItems, jsonInput, maxSelectedFields, page, selectedFields, sortBy, sortDirection, valueSearch, valuesPageSize])

  const selectedFieldInfos = useMemo(
    () => selectedFields.map((fieldPath) => knownFieldsByPath[fieldPath] ?? fields.find((field) => field.field_path === fieldPath) ?? fieldSummaryFallback(fieldPath)),
    [fields, knownFieldsByPath, selectedFields],
  )
  const fieldOptions = useMemo<MultiSelectOption[]>(
    () => fields.map((field) => ({
      value: field.field_path,
      label: field.label,
      description: field.field_path,
      metadata: [
        `${formatInteger(field.unique_value_count)} unique`,
        `${formatInteger(field.non_null_count)} filled`,
        field.type_hints.length > 0 ? `Types: ${field.type_hints.join(', ')}` : 'Types: unknown',
      ],
    })),
    [fields],
  )
  const totalPages = valuesResult ? Math.max(1, Math.ceil(valuesResult.total_groups / valuesPageSize)) : 1
  const duplicateGroupsOnPage = useMemo(() => valuesResult?.groups.filter((group) => group.count > 1) ?? [], [valuesResult])
  const displayedGroups = showDuplicateGroupsOnly ? duplicateGroupsOnPage : (valuesResult?.groups ?? [])
  const summary = useMemo(() => buildValuesSummary(valuesResult), [valuesResult])

  function handleSelectedFieldsChange(nextSelectedFields: string[]) {
    setSelectionLimitMessage(null)
    setActionMessage(null)
    setSelectedFields((current) => {
      if (nextSelectedFields.length > maxSelectedFields) {
        setSelectionLimitMessage(`Select up to ${maxSelectedFields} fields for one Values Explorer request.`)
        return current
      }

      if (areStringArraysEqual(current, nextSelectedFields)) {
        return current
      }

      setPage(1)
      return nextSelectedFields
    })
  }

  function handleSelectionLimit(maximumFields: number) {
    setSelectionLimitMessage(`Select up to ${maximumFields} fields for one Values Explorer request.`)
  }

  function clearValuesResults() {
    analysisRequestIdRef.current += 1
    setSelectedFields([])
    setValueSearch('')
    setSortBy(DEFAULT_SORT_BY)
    setSortDirection(DEFAULT_SORT_DIRECTION)
    setShowDuplicateGroupsOnly(false)
    setPage(1)
    setValuesResult(null)
    setAnalysisError(null)
    setIsAnalyzing(false)
    setActionMessage('Values results cleared.')
  }

  async function copyFieldSet() {
    if (selectedFields.length === 0) {
      return
    }

    await copy(selectedFields.join('\n'), 'values-field-set')
  }

  async function copyVisibleSummary() {
    if (duplicateGroupsOnPage.length === 0) {
      return
    }

    const rows = duplicateGroupsOnPage.map((group) => [group.display_value, group.count, group.source_paths.join(', '), group.record_indexes.join(', ')].join('\t'))
    const text = ['Value group\tCount\tSource paths\tRecord indexes', ...rows].join('\n')

    await copy(text, 'values-visible-summary')
  }

  async function copyValueGroupRecords(group: ValuesGroup, groupIndex: number) {
    const text = buildValueGroupItemsCopyText(group)
    if (!text) {
      return
    }

    await copy(text, valueGroupCopyKey(groupIndex))
  }

  if (!isConfigLoaded) {
    return (
      <section className="values-explorer" aria-label="Values Explorer view">
        <div className="state-card" role="status">
          <strong>Loading Values Explorer configuration…</strong>
          <span>Checking whether grouped value insights are available.</span>
        </div>
      </section>
    )
  }

  if (valuesExplorerDisabled) {
    return (
      <section className="values-explorer" aria-label="Values Explorer view">
        <div className="state-card" role="status">
          <strong>Values Explorer disabled</strong>
          <span>Values Explorer is disabled by configuration. Grouped value duplicate insights are unavailable in this build.</span>
        </div>
      </section>
    )
  }

  return (
    <section className="values-explorer" aria-label="Values Explorer view">
      <div className="result-card values-controls-card">
        <div className="result-card-heading">
          <div>
            <h3>Values Explorer</h3>
            <p className="muted">Select fields, filter values, and review unique or repeated groups.</p>
          </div>
          <div className="result-heading-actions">
            <button type="button" disabled={selectedFields.length === 0 && !valuesResult && !valueSearch} onClick={clearValuesResults}>
              Clear Results
            </button>
          </div>
        </div>

        <div className="values-layout">
          <div className="field-picker" aria-label="Values field picker">
            <MultiSelectDropdown
              id="values-field-picker"
              label="Select fields"
              options={fieldOptions}
              value={selectedFields}
              onChange={handleSelectedFieldsChange}
              maxSelected={maxSelectedFields}
              placeholder="Choose value fields"
              searchPlaceholder="Search fields…"
              searchValue={fieldSearch}
              onSearchChange={setFieldSearch}
              onSelectionLimit={handleSelectionLimit}
              loading={isDiscovering}
              error={discoveryError ? `${discoveryError.title}: ${discoveryError.detail}` : null}
              emptyMessage="No value fields found. Try a different field filter or analyze a JSON array/object with scalar fields."
            />

            {selectionLimitMessage ? <p className="input-help warning-text">{selectionLimitMessage}</p> : null}
            {actionMessage ? <p className="input-help" role="status">{actionMessage}</p> : null}
            {errorMessage ? <p className="input-help warning-text" role="status">{errorMessage}</p> : null}
          </div>

          <div className="selected-fields-panel" aria-label="Selected field set">
            <div className="selected-fields-heading">
              <h4>Field Set</h4>
              <button
                type="button"
                className={`copy-button ${copiedKey === 'values-field-set' ? 'copied' : ''} ${errorKey === 'values-field-set' ? 'error' : ''}`}
                disabled={selectedFields.length === 0}
                onClick={() => { void copyFieldSet() }}
              >
                {copiedKey === 'values-field-set' ? 'Copied' : errorKey === 'values-field-set' ? 'Copy failed' : 'Copy fields'}
              </button>
            </div>
            {selectedFieldInfos.length === 0 ? (
              <p className="muted">Select at least one field to analyze values.</p>
            ) : (
              <div className="selected-field-list">
                {selectedFieldInfos.map((field) => (
                  <article key={field.field_path} className="selected-field-card">
                    <div>
                      <strong>{field.label}</strong>
                      <code>{field.field_path}</code>
                    </div>
                    <dl>
                      <div><dt>Types</dt><dd>{field.type_hints.join(', ') || 'unknown'}</dd></div>
                      <div><dt>Unique</dt><dd>{formatInteger(field.unique_value_count)}</dd></div>
                      <div><dt>Null</dt><dd>{formatInteger(field.null_count)}</dd></div>
                      <div><dt>Missing</dt><dd>{formatInteger(field.missing_count)}</dd></div>
                    </dl>
                    {field.sample_values.length > 0 ? (
                      <p className="input-help">Samples: {field.sample_values.slice(0, 3).map(formatUnknown).join(', ')}</p>
                    ) : null}
                  </article>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="result-card values-results-card">
        <div className="result-card-heading values-results-heading">
          <div>
            <h3>Grouped values</h3>
            <p className="muted">Review repeated values and copy the records behind any group.</p>
          </div>
        </div>
        <div className="values-toolbar" aria-label="Values filter controls">
          <label>
            <span>Value search</span>
            <input
              className="text-input"
              type="search"
              value={valueSearch}
              onChange={(event) => {
                setPage(1)
                setValueSearch(event.target.value)
              }}
              placeholder="Filter grouped values…"
            />
          </label>
          <label>
            <span>Sort by</span>
            <select
              value={sortBy}
              onChange={(event) => {
                setPage(1)
                setSortBy(event.target.value as ValuesSortBy)
              }}
            >
              <option value="count">Count</option>
              <option value="value">Value</option>
              <option value="first_source_path">First source path</option>
            </select>
          </label>
          <label>
            <span>Direction</span>
            <select
              value={sortDirection}
              onChange={(event) => {
                setPage(1)
                setSortDirection(event.target.value as 'asc' | 'desc')
              }}
            >
              <option value="desc">Descending</option>
              <option value="asc">Ascending</option>
            </select>
          </label>
          <label>
            <span>Page size</span>
            <select
              value={pageSize}
              onChange={(event) => {
                setPage(1)
                setPageSize(Number(event.target.value))
              }}
            >
              {pageSizes.map((size) => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
          </label>
          <label className="checkbox-row values-checkbox-row">
            <input
              type="checkbox"
              checked={showDuplicateGroupsOnly}
              disabled={!valuesResult || (!showDuplicateGroupsOnly && duplicateGroupsOnPage.length === 0)}
              onChange={(event) => {
                setShowDuplicateGroupsOnly(event.target.checked)
              }}
            />
            Duplicate groups only
          </label>
          <label className="checkbox-row values-checkbox-row">
            <input
              type="checkbox"
              checked={includeParentItems}
              onChange={(event) => {
                setIncludeParentItems(event.target.checked)
              }}
            />
            Parent/source details
          </label>
        </div>
        <div className="values-secondary-actions">
          <button
            type="button"
            className={`copy-button compact ${copiedKey === 'values-visible-summary' ? 'copied' : ''} ${errorKey === 'values-visible-summary' ? 'error' : ''}`}
            disabled={duplicateGroupsOnPage.length === 0}
            onClick={() => { void copyVisibleSummary() }}
          >
            {copiedKey === 'values-visible-summary' ? 'Copied' : errorKey === 'values-visible-summary' ? 'Copy failed' : 'Copy duplicate summary'}
          </button>
        </div>

        <ValuesSummaryPanel summary={summary} selectedFields={selectedFields} />

        {valuesPageSizeClamped ? (
          <p className="input-help warning-text">
            Values requests use page size {formatInteger(valuesPageSize)} because the selected page size is above the Values Explorer limit.
          </p>
        ) : null}
        {selectionValidationMessage ? <p className="input-help warning-text">{selectionValidationMessage}</p> : null}
        {analysisError ? <InlineProblem error={analysisError} /> : null}
        {selectedFields.length === 0 ? (
          <div className="inline-empty-state">
            <strong>No fields selected</strong>
            <span>Select one or more fields to load grouped values.</span>
          </div>
        ) : null}
        {isAnalyzing ? <p className="muted" role="status">Loading grouped values…</p> : null}
        {!isAnalyzing && valuesResult && valuesResult.groups.length === 0 ? (
          <div className="inline-empty-state">
            <strong>No values match</strong>
            <span>Try clearing value search or changing the selected fields.</span>
          </div>
        ) : null}
        {!isAnalyzing && valuesResult && showDuplicateGroupsOnly && valuesResult.groups.length > 0 && displayedGroups.length === 0 ? (
          <div className="inline-empty-state">
            <strong>No duplicate groups on this page</strong>
            <span>Clear the duplicate-only filter or navigate pages to review all grouped values.</span>
          </div>
        ) : null}
        {displayedGroups.length > 0 ? (
          <ValuesGroupsTable
            groups={displayedGroups}
            selectedFields={selectedFields}
            copiedKey={copiedKey}
            errorKey={errorKey}
            onCopyGroup={(group, groupIndex) => { void copyValueGroupRecords(group, groupIndex) }}
          />
        ) : null}

        <div className="pagination-row" aria-label="Values pagination">
          <span>
            Page {formatInteger(page)} of {formatInteger(totalPages)} · {formatInteger(valuesResult?.total_groups ?? 0)} groups · {formatInteger(duplicateGroupsOnPage.length)} duplicate groups on page
          </span>
          <div>
            <button
              type="button"
              disabled={page <= 1 || isAnalyzing}
              onClick={() => {
                setPage((current) => Math.max(1, current - 1))
              }}
            >
              Previous
            </button>
            <button
              type="button"
              disabled={!valuesResult?.has_next_page || isAnalyzing}
              onClick={() => {
                setPage((current) => current + 1)
              }}
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}

interface ValuesSummary {
  valueGroups: number | null
  duplicateGroupsOnPage: number | null
  pageValues: number
}

function ValuesSummaryPanel({ summary, selectedFields }: { summary: ValuesSummary; selectedFields: string[] }) {
  return (
    <div className="summary-strip values-summary" aria-label="Values results summary">
      <Metric label="Groups" value={summary.valueGroups === null ? '—' : formatInteger(summary.valueGroups)} />
      <Metric label="Duplicates" value={summary.duplicateGroupsOnPage === null ? '—' : formatInteger(summary.duplicateGroupsOnPage)} />
      <Metric label="Page values" value={formatInteger(summary.pageValues)} />
      <Metric label="Field set" value={selectedFields.length === 0 ? 'None' : formatInteger(selectedFields.length)} />
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function ValuesGroupsTable({
  groups,
  selectedFields,
  copiedKey,
  errorKey,
  onCopyGroup,
}: {
  groups: ValuesGroup[]
  selectedFields: string[]
  copiedKey: string | null
  errorKey: string | null
  onCopyGroup: (group: ValuesGroup, groupIndex: number) => void
}) {
  return (
    <div className="values-groups-list" role="list" aria-label="Grouped values list">
      {groups.map((group, groupIndex) => {
        const isDuplicateGroup = group.count > 1
        const copyKey = valueGroupCopyKey(groupIndex)
        return (
          <article
            key={`${group.display_value}-${group.source_paths.join('|')}-${group.record_indexes.join('|')}-${groupIndex}`}
            className={`value-group-row ${isDuplicateGroup ? 'duplicate-value-row' : ''}`}
            role="listitem"
          >
            <div className="value-group-main">
              <div className="value-group-title">
                <strong>{group.display_value}</strong>
                <span className={isDuplicateGroup ? 'duplicate-group-badge' : 'single-group-badge'}>
                  {isDuplicateGroup ? 'Duplicate' : 'Single'}
                </span>
              </div>
              {selectedFields.length > 1 ? (
                <dl className="key-detail-list value-group-key-list">
                  {selectedFields.map((fieldPath, index) => (
                    <div key={`${fieldPath}-${index}`}>
                      <dt>{fieldPath}</dt>
                      <dd>{formatUnknown(group.key[index])}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
              <div className="value-group-meta" aria-label={`Value group ${groupIndex + 1} summary`}>
                <span><strong>{formatInteger(group.count)}</strong> {isDuplicateGroup ? 'repeated values' : 'single value'}</span>
                <span>{summarizePaths(group.source_paths)}</span>
                <span>{summarizeRecords(group.record_indexes)}</span>
              </div>
            </div>
            <div className="value-group-actions">
              <button
                type="button"
                className={`copy-button compact ${copiedKey === copyKey ? 'copied' : ''} ${errorKey === copyKey ? 'error' : ''}`}
                disabled={group.parent_items.length === 0}
                aria-label={`Copy value group ${groupIndex + 1} JSON records`}
                onClick={() => onCopyGroup(group, groupIndex)}
              >
                {copiedKey === copyKey
                  ? 'Copied'
                  : errorKey === copyKey
                    ? 'Copy failed'
                    : 'Copy records'}
              </button>
            </div>
            <details className="value-group-details">
              <summary>Details</summary>
              <div className="value-group-detail-grid">
                <div>
                  <h5>Source paths</h5>
                  <PathList paths={group.source_paths} />
                </div>
                <div>
                  <h5>Records</h5>
                  <p>{group.record_indexes.length > 0 ? group.record_indexes.join(', ') : '—'}</p>
                </div>
                <div>
                  <h5>Parent/source items</h5>
                  <ParentItems items={group.parent_items} />
                </div>
              </div>
            </details>
          </article>
        )
      })}
    </div>
  )
}

function PathList({ paths }: { paths: string[] }) {
  if (paths.length === 0) {
    return <span className="muted">—</span>
  }

  return (
    <div className="source-path-list">
      {paths.slice(0, 6).map((path, index) => <code key={`${path}-${index}`}>{path}</code>)}
      {paths.length > 6 ? <span className="muted">+{formatInteger(paths.length - 6)} more</span> : null}
    </div>
  )
}

function ParentItems({ items }: { items: ParentItem[] }) {
  if (items.length === 0) {
    return <span className="muted">No parent summaries</span>
  }

  return (
    <details>
      <summary>{formatInteger(items.length)} parent item{items.length === 1 ? '' : 's'}</summary>
      <ul className="parent-item-list">
        {items.slice(0, 8).map((item, index) => (
          <li key={`${item.record_index}-${item.source_path ?? 'source'}-${index}`}>
            <strong>Record {item.record_index}</strong>
            {item.source_path ? <code>{item.source_path}</code> : null}
            <span>{formatSummary(item.summary)}</span>
          </li>
        ))}
      </ul>
    </details>
  )
}

function summarizePaths(paths: string[]): string {
  if (paths.length === 0) {
    return 'No source paths'
  }

  const firstPath = paths[0]
  return paths.length === 1 ? firstPath : `${firstPath} +${formatInteger(paths.length - 1)}`
}

function summarizeRecords(recordIndexes: number[]): string {
  if (recordIndexes.length === 0) {
    return 'No records'
  }

  const visible = recordIndexes.slice(0, 3).join(', ')
  return recordIndexes.length <= 3 ? `Records ${visible}` : `Records ${visible} +${formatInteger(recordIndexes.length - 3)}`
}

function InlineProblem({ error }: { error: ProblemDetails }) {
  return (
    <div className="state-card error-state inline-problem" role="alert">
      <strong>{error.title}</strong>
      <span>{error.detail}</span>
    </div>
  )
}

function buildValuesSummary(valuesResult: ValuesAnalysisResponse | null): ValuesSummary {
  const pageValues = valuesResult?.groups.reduce((total, group) => total + group.count, 0) ?? 0
  const duplicateGroups = valuesResult?.groups.filter((group) => group.count > 1) ?? []
  const duplicateGroupsOnPage = valuesResult ? duplicateGroups.length : null
  const valueGroups = valuesResult?.total_groups ?? null

  return { valueGroups, duplicateGroupsOnPage, pageValues }
}

function valueGroupCopyKey(groupIndex: number) {
  return `values-group-${groupIndex}`
}

function buildValueGroupItemsCopyText(group: ValuesGroup): string {
  return group.parent_items
    .map((item) => JSON.stringify(item.summary, null, 2))
    .join('\n\n')
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

function areStringArraysEqual(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function formatSummary(summary: Record<string, unknown>): string {
  const parts = Object.entries(summary).slice(0, 5).map(([key, value]) => `${key}: ${formatUnknown(value)}`)
  return parts.length > 0 ? parts.join(', ') : 'No summary fields'
}

function formatUnknown(value: unknown): string {
  if (value === null) {
    return 'null'
  }

  if (typeof value === 'string') {
    return value
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }

  if (value === undefined) {
    return 'missing'
  }

  return JSON.stringify(value)
}
