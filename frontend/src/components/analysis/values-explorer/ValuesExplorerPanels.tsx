import type { ReactNode } from 'react'
import type {
  ProblemDetails,
  ValuesExplorerAnalysisResponse,
  ValuesExplorerGroup,
  ValuesFieldInfo,
} from '../../../lib/commands'
import { formatInteger } from '../../common/format'
import { CheckGlyph, ChevronDownGlyph, ChevronUpGlyph, CopyGlyph, WarningGlyph } from './icons'
import type { ExpandedGroupsState, ValuesSectionKey } from './types'
import { formatDisplayValue, valueGroupCopyKey, valueGroupId } from './utils'

export function ValuesStateCard({ title, body }: { title: string; body: string }) {
  return (
    <section className="values-explorer" aria-label="Values Explorer view">
      <div className="state-card" role="status">
        <strong>{title}</strong>
        <span>{body}</span>
      </div>
    </section>
  )
}

export function FilterControls({
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

export function ResultsSummary({
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

export function ResultsPanels({
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

export function InlineProblem({ error }: { error: ProblemDetails }) {
  return (
    <div className="inline-problem" role="alert">
      <strong>{error.title}</strong>
      <span>{error.detail}</span>
    </div>
  )
}
