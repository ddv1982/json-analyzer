import { useEffect, useMemo, useRef, useState } from 'react'
import {
  analyzeAdvancedFieldDuplicates,
  analyzeCompositeDuplicates,
  discoverValuesFields,
  getConfig,
  normalizeCommandError,
  type AppConfig,
  type DuplicateFilter,
  type ProblemDetails,
  type ValuesFieldInfo,
} from '../../../lib/commands'
import { ComboboxSelect, type ComboboxOption } from '../../common/ComboboxSelect'
import { formatInteger } from '../../common/format'
import { Badge } from '../../common/Badge'
import { Button } from '../../common/Button'
import { MultiSelectDropdown, type MultiSelectOption } from '../../common/MultiSelectDropdown'
import { AdvancedDuplicatesView, type AdvancedDuplicateResult } from './AdvancedDuplicatesView'

const FALLBACK_DUPLICATE_LIMITS: AppConfig['limits']['duplicates'] = {
  composite_min_fields: 2,
  composite_max_fields: 5,
  default_page_size: 25,
  max_page_size: 100,
  max_match_combinations_per_record: 10_000,
  max_match_combinations_per_request: 100_000,
}

export function AdvancedDuplicateWorkflow({ jsonInput, initialConfig }: { jsonInput: string; initialConfig?: AppConfig }) {
  const [fieldSearch, setFieldSearch] = useState('')
  const [fields, setFields] = useState<ValuesFieldInfo[]>([])
  const [knownFieldsByPath, setKnownFieldsByPath] = useState<Record<string, ValuesFieldInfo>>({})
  const [selectedFields, setSelectedFields] = useState<string[]>([])
  const [filterField, setFilterField] = useState('')
  const [filterValue, setFilterValue] = useState('')
  const [includeParentItems, setIncludeParentItems] = useState(true)
  const [pageSize, setPageSize] = useState(initialConfig?.limits.duplicates.default_page_size ?? FALLBACK_DUPLICATE_LIMITS.default_page_size)
  const [config, setConfig] = useState<AppConfig | null>(initialConfig ?? null)
  const [configLoaded, setConfigLoaded] = useState(Boolean(initialConfig))
  const [discoveryError, setDiscoveryError] = useState<ProblemDetails | null>(null)
  const [duplicateError, setDuplicateError] = useState<ProblemDetails | null>(null)
  const [isDiscovering, setIsDiscovering] = useState(false)
  const [isDuplicateAnalyzing, setIsDuplicateAnalyzing] = useState(false)
  const [duplicateResult, setDuplicateResult] = useState<AdvancedDuplicateResult | null>(null)
  const [selectionLimitMessage, setSelectionLimitMessage] = useState<string | null>(null)
  const discoveryRequestIdRef = useRef(0)
  const duplicateRequestIdRef = useRef(0)
  const knownFieldsJsonInputRef = useRef(jsonInput)
  const duplicateLimits = config?.limits.duplicates ?? FALLBACK_DUPLICATE_LIMITS
  const disabledFeature = getDisabledDuplicateWorkflowFeature(configLoaded ? config : null)
  const advancedDuplicatesDisabled = disabledFeature !== null
  const pageSizes = buildDuplicatePageSizes(duplicateLimits)
  const maxSelectedFields = duplicateLimits.composite_max_fields

  useEffect(() => {
    if (configLoaded) {
      return
    }

    let canceled = false
    getConfig()
      .then((response) => {
        if (!canceled) {
          setConfig(response.config)
          setPageSize(response.config.limits.duplicates.default_page_size)
        }
      })
      .catch(() => {
        if (!canceled) {
          setConfig(null)
        }
      })
      .finally(() => {
        if (!canceled) {
          setConfigLoaded(true)
        }
      })

    return () => {
      canceled = true
    }
  }, [configLoaded])

  useEffect(() => {
    if (!configLoaded) {
      return
    }

    const requestId = discoveryRequestIdRef.current + 1
    const resetKnownFields = knownFieldsJsonInputRef.current !== jsonInput
    discoveryRequestIdRef.current = requestId
    knownFieldsJsonInputRef.current = jsonInput
    if (resetKnownFields) {
      setKnownFieldsByPath({})
    }

    if (advancedDuplicatesDisabled) {
      setFields([])
      setKnownFieldsByPath({})
      setSelectedFields([])
      setIsDiscovering(false)
      setDiscoveryError(null)
      return
    }

    setIsDiscovering(true)
    setDiscoveryError(null)

    discoverValuesFields({
      json_string: jsonInput,
      search: fieldSearch.trim() || null,
      limit: null,
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
  }, [advancedDuplicatesDisabled, configLoaded, fieldSearch, jsonInput])

  const knownFields = useMemo(() => Object.values(knownFieldsByPath), [knownFieldsByPath])
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
  const filterOptions = useMemo<ComboboxOption[]>(() => {
    const options = knownFields.map((field) => ({
      value: field.field_path,
      label: field.label,
      description: field.field_path,
    }))

    if (filterField && !options.some((option) => option.value === filterField)) {
      options.unshift({ value: filterField, label: filterField, description: 'Selected filter field' })
    }

    return options
  }, [filterField, knownFields])
  const duplicateFilter = useMemo(() => buildDuplicateFilter(filterField, filterValue), [filterField, filterValue])
  const duplicatePageSize = Math.min(pageSize, duplicateLimits.max_page_size)
  const duplicatePageSizeClamped = duplicatePageSize < pageSize
  const duplicateValidationMessage = getDuplicateValidationMessage(selectedFields.length, duplicateLimits)
  const workflowMode = selectedFields.length <= 1 ? 'Field duplicates' : 'Composite duplicates'

  useEffect(() => {
    duplicateRequestIdRef.current += 1
    setDuplicateResult(null)
    setDuplicateError(null)
    setIsDuplicateAnalyzing(false)
  }, [duplicateFilter, includeParentItems, jsonInput, duplicatePageSize, selectedFields])

  function handleSelectedFieldsChange(nextSelectedFields: string[]) {
    setSelectionLimitMessage(null)
    setSelectedFields((current) => {
      if (nextSelectedFields.length > maxSelectedFields) {
        setSelectionLimitMessage(`Select up to ${maxSelectedFields} fields for composite duplicate analysis.`)
        return current
      }

      if (areStringArraysEqual(current, nextSelectedFields)) {
        return current
      }

      return nextSelectedFields
    })
  }

  function handleSelectionLimit(maximumFields: number) {
    setSelectionLimitMessage(`Select up to ${maximumFields} fields for composite duplicate analysis.`)
  }

  async function runDuplicateAnalysis(targetPage = 1) {
    if (selectedFields.length === 0) {
      return
    }

    if (advancedDuplicatesDisabled) {
      setDuplicateResult(null)
      setDuplicateError(unsupportedFeatureProblem(disabledFeature ?? 'features.advanced_duplicates'))
      return
    }

    const validationMessage = getDuplicateValidationMessage(selectedFields.length, duplicateLimits)
    if (validationMessage) {
      setDuplicateResult(null)
      return
    }

    const requestId = duplicateRequestIdRef.current + 1
    duplicateRequestIdRef.current = requestId
    setIsDuplicateAnalyzing(true)
    setDuplicateError(null)

    try {
      if (selectedFields.length === 1) {
        const result = await analyzeAdvancedFieldDuplicates({
          json_string: jsonInput,
          field_path: selectedFields[0],
          filter: duplicateFilter,
          case_sensitive: true,
          include_parent_items: includeParentItems,
          page: targetPage,
          page_size: duplicatePageSize,
        })
        if (duplicateRequestIdRef.current === requestId) {
          setDuplicateResult({ mode: 'field', result, filter: duplicateFilter })
        }
      } else {
        const result = await analyzeCompositeDuplicates({
          json_string: jsonInput,
          field_paths: selectedFields,
          filter: duplicateFilter,
          case_sensitive: true,
          include_parent_items: includeParentItems,
          page: targetPage,
          page_size: duplicatePageSize,
        })
        if (duplicateRequestIdRef.current === requestId) {
          setDuplicateResult({ mode: 'composite', result, filter: duplicateFilter })
        }
      }
    } catch (unknownError) {
      if (duplicateRequestIdRef.current === requestId) {
        setDuplicateResult(null)
        setDuplicateError(normalizeCommandError(unknownError))
      }
    } finally {
      if (duplicateRequestIdRef.current === requestId) {
        setIsDuplicateAnalyzing(false)
      }
    }
  }

  if (!configLoaded) {
    return (
      <section className="result-card duplicate-launch-card" aria-label="Duplicate analysis workflow">
        <div className="result-card-heading">
          <div>
            <h3>Find duplicates by field</h3>
            <p className="muted">Select one field for value duplicates or combine fields to find repeated records.</p>
          </div>
          <Badge variant="success">Loading</Badge>
        </div>
        <p className="muted" role="status">Loading duplicate workflow…</p>
      </section>
    )
  }

  if (advancedDuplicatesDisabled) {
    return (
      <section className="result-card duplicate-launch-card" aria-label="Duplicate analysis workflow">
        <div className="result-card-heading">
          <div>
            <h3>Find duplicates by field</h3>
            <p className="muted">Select one field for value duplicates or combine fields to find repeated records.</p>
          </div>
          <Badge variant="warning">Disabled</Badge>
        </div>
        <div className="inline-empty-state duplicate-empty-state" role="status">
          <strong>Field duplicate analysis is disabled</strong>
          <span>This workflow requires enabled {disabledFeature}.</span>
        </div>
      </section>
    )
  }

  return (
    <section className="result-card duplicate-launch-card" aria-label="Duplicate analysis workflow">
      <div className="result-card-heading">
        <div>
          <h3>Find duplicates by field</h3>
          <p className="muted">Select one field for value duplicates or combine fields to find repeated records.</p>
        </div>
        <Badge variant="success">{workflowMode}</Badge>
      </div>

      <div className="values-layout duplicate-workflow-layout">
        <div className="field-picker" aria-label="Duplicate field picker">
          <MultiSelectDropdown
            id="duplicate-field-picker"
            label="Duplicate fields"
            options={fieldOptions}
            value={selectedFields}
            onChange={handleSelectedFieldsChange}
            maxSelected={maxSelectedFields}
            placeholder="Choose duplicate fields"
            searchPlaceholder="Search fields…"
            searchValue={fieldSearch}
            onSearchChange={setFieldSearch}
            onSelectionLimit={handleSelectionLimit}
            loading={isDiscovering}
            error={discoveryError ? `${discoveryError.title}: ${discoveryError.detail}` : null}
            emptyMessage="No fields found. Try a different search or analyze a JSON array/object with scalar fields."
          />
          {selectionLimitMessage ? <p className="input-help warning-text">{selectionLimitMessage}</p> : null}
        </div>

        <div className="selected-fields-panel" aria-label="Duplicate field set">
          <h4>Field Set</h4>
          {selectedFields.length === 0 ? (
            <p className="muted">Select at least one field to run duplicate analysis.</p>
          ) : (
            <div className="selected-field-list compact-selected-fields">
              {selectedFields.map((fieldPath) => {
                const field = knownFieldsByPath[fieldPath] ?? fieldSummaryFallback(fieldPath)
                return (
                  <article key={fieldPath} className="selected-field-card">
                    <div>
                      <strong>{field.label}</strong>
                      <code>{field.field_path}</code>
                    </div>
                    <dl>
                      <div><dt>Unique</dt><dd>{formatInteger(field.unique_value_count)}</dd></div>
                      <div><dt>Filled</dt><dd>{formatInteger(field.non_null_count)}</dd></div>
                    </dl>
                  </article>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <div className="duplicate-toolbar" aria-label="Duplicate analysis controls">
        <ComboboxSelect
          id="duplicate-filter-field"
          label="Filter by field"
          options={filterOptions}
          value={filterField || null}
          onChange={(nextField) => {
            setFilterField(nextField ?? '')
            if (!nextField) {
              setFilterValue('')
            }
          }}
          placeholder="No filter"
          emptyMessage="No matching fields found."
        />
        <label>
          <span>Filter value</span>
          <input
            className="text-input"
            type="text"
            value={filterValue}
            disabled={!filterField}
            onChange={(event) => {
              setFilterValue(event.target.value)
            }}
            placeholder="e.g. active, 42, true"
          />
        </label>
        <label>
          <span>Page size</span>
          <select
            value={pageSize}
            onChange={(event) => {
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
            checked={includeParentItems}
            onChange={(event) => {
              setIncludeParentItems(event.target.checked)
            }}
          />
          Parent/source details
        </label>
        <Button
          variant="primary"
          disabled={selectedFields.length === 0 || isDuplicateAnalyzing || Boolean(duplicateValidationMessage)}
          onClick={() => {
            void runDuplicateAnalysis(1)
          }}
        >
          {isDuplicateAnalyzing ? 'Finding duplicates…' : 'Find Duplicates'}
        </Button>
      </div>

      {duplicatePageSizeClamped ? (
        <p className="input-help warning-text">
          Duplicate requests use page size {formatInteger(duplicatePageSize)} because the selected page size is above the duplicate limit.
        </p>
      ) : null}
      {duplicateValidationMessage ? <p className="input-help warning-text">{duplicateValidationMessage}</p> : null}
      {duplicateError ? <InlineProblem error={duplicateError} /> : null}

      {duplicateResult ? (
        <>
          <AdvancedDuplicatesView duplicateResult={duplicateResult} />
          <div className="pagination-row" aria-label="Duplicate pagination">
            <span>
              Duplicate page {formatInteger(duplicateResult.result.page)} · {formatInteger(duplicateResult.result.duplicate_group_count)} groups
            </span>
            <div>
              <button
                type="button"
                disabled={duplicateResult.result.page <= 1 || isDuplicateAnalyzing}
                onClick={() => {
                  void runDuplicateAnalysis(Math.max(1, duplicateResult.result.page - 1))
                }}
              >
                Previous duplicate page
              </button>
              <button
                type="button"
                disabled={!duplicateResult.result.has_next_page || isDuplicateAnalyzing}
                onClick={() => {
                  void runDuplicateAnalysis(duplicateResult.result.page + 1)
                }}
              >
                Next duplicate page
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="inline-empty-state duplicate-empty-state">
          <strong>Ready to find duplicates</strong>
          <span>Choose fields, optionally add a filter, then run duplicate analysis.</span>
        </div>
      )}
    </section>
  )
}

function InlineProblem({ error }: { error: ProblemDetails }) {
  return (
    <div className="state-card error-state inline-problem" role="alert">
      <strong>{error.title}</strong>
      <span>{error.detail}</span>
    </div>
  )
}

function buildDuplicatePageSizes(duplicateLimits: AppConfig['limits']['duplicates']): number[] {
  return Array.from(
    new Set(
      [10, duplicateLimits.default_page_size, 50, duplicateLimits.max_page_size]
        .filter((size) => size > 0 && size <= duplicateLimits.max_page_size),
    ),
  ).sort((left, right) => left - right)
}

function unsupportedFeatureProblem(featureName: string): ProblemDetails {
  const detail = `field duplicate analysis requires enabled ${featureName}`
  return {
    error_type: 'unsupported_config',
    title: 'Unsupported configuration',
    status: 501,
    detail,
    instance: null,
    invalid_params: [{ name: featureName, reason: detail }],
  }
}

function getDisabledDuplicateWorkflowFeature(config: AppConfig | null): string | null {
  if (!config) {
    return null
  }

  if (!config.features.values_explorer) {
    return 'features.values_explorer'
  }

  if (!config.features.advanced_duplicates) {
    return 'features.advanced_duplicates'
  }

  return null
}

function getDuplicateValidationMessage(selectedFieldCount: number, duplicateLimits: AppConfig['limits']['duplicates']): string | null {
  if (selectedFieldCount <= 1) {
    return null
  }

  if (selectedFieldCount < duplicateLimits.composite_min_fields) {
    return `Select at least ${duplicateLimits.composite_min_fields} fields for composite duplicate analysis, or select exactly one field for single-field duplicates.`
  }

  if (selectedFieldCount > duplicateLimits.composite_max_fields) {
    return `Select no more than ${duplicateLimits.composite_max_fields} fields for composite duplicate analysis.`
  }

  return null
}

function buildDuplicateFilter(fieldPath: string, rawValue: string): DuplicateFilter | null {
  if (!fieldPath || rawValue.trim().length === 0) {
    return null
  }

  return { field_path: fieldPath, value: parseFilterValue(rawValue) }
}

function parseFilterValue(rawValue: string): unknown {
  try {
    return JSON.parse(rawValue) as unknown
  } catch {
    return rawValue
  }
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
