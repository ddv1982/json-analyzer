import type {
  AdvancedFieldDuplicateGroup,
  AdvancedFieldDuplicatesResponse,
  CompositeDuplicateGroup,
  CompositeDuplicatesResponse,
  DuplicateFilter,
  ParentItem,
} from '../../../lib/commands'
import { formatInteger } from '../../common/format'
import { Badge } from '../../common/Badge'
import { TableScroll } from '../../common/TableScroll'

export type AdvancedDuplicateResult =
  | { mode: 'field'; result: AdvancedFieldDuplicatesResponse; filter: DuplicateFilter | null }
  | { mode: 'composite'; result: CompositeDuplicatesResponse; filter: DuplicateFilter | null }

export function AdvancedDuplicatesView({ duplicateResult }: { duplicateResult: AdvancedDuplicateResult }) {
  const groupCount = duplicateResult.result.duplicate_group_count
  const groupsOnPage = duplicateResult.result.duplicates.length
  const isFieldMode = duplicateResult.mode === 'field'

  return (
    <section className="result-card duplicate-results-card" aria-label="Advanced duplicate results">
      <div className="result-card-heading">
        <div>
          <h3>{isFieldMode ? 'Field duplicate analysis' : 'Composite duplicate analysis'}</h3>
          <p className="muted">
            {isFieldMode
              ? `Selected field: ${duplicateResult.result.field_path}`
              : `Composite key: ${duplicateResult.result.field_paths.join(' + ')}`}
          </p>
          {duplicateResult.filter ? (
            <p className="input-help duplicate-filter-note">
              Filtered by <code>{duplicateResult.filter.field_path}</code> = <strong>{formatUnknown(duplicateResult.filter.value)}</strong>
            </p>
          ) : null}
        </div>
        <div className="result-heading-actions">
          <Badge variant={groupCount > 0 ? 'warning' : 'success'}>
            {groupCount > 0 ? `${formatInteger(groupCount)} duplicate group${groupCount === 1 ? '' : 's'}` : 'No duplicates'}
          </Badge>
        </div>
      </div>

      <div className="metric-grid compact-metrics duplicate-metrics">
        {isFieldMode ? (
          <>
            <Metric label="Items considered" value={formatInteger(duplicateResult.result.total_items_considered)} />
            <Metric label="All values" value={formatInteger(duplicateResult.result.all_values_summary.length)} />
          </>
        ) : (
          <Metric label="Selected fields" value={formatInteger(duplicateResult.result.field_paths.length)} />
        )}
        <Metric label="Duplicate groups" value={formatInteger(groupCount)} />
      </div>

      {groupsOnPage === 0 ? (
        <div className="inline-empty-state duplicate-empty-state">
          <strong>{groupCount === 0 ? 'No duplicate groups found' : 'No duplicate groups on this page'}</strong>
          <span>
            {duplicateResult.filter
              ? 'Try clearing the duplicate filter or choose another field/value combination.'
              : 'Try a different selected field or composite key.'}
          </span>
        </div>
      ) : duplicateResult.mode === 'field' ? (
        <FieldDuplicateGroupsList result={duplicateResult.result} />
      ) : (
        <CompositeDuplicateGroupsList result={duplicateResult.result} />
      )}

      {duplicateResult.mode === 'field' ? <AllValuesSummary result={duplicateResult.result} /> : null}
    </section>
  )
}

function FieldDuplicateGroupsList({ result }: { result: AdvancedFieldDuplicatesResponse }) {
  return (
    <div className="duplicate-result-list" role="list" aria-label="Field duplicate groups list">
      {result.duplicates.map((group, index) => (
        <DuplicateResultRow
          key={`${group.display_value}-${group.record_indexes.join('-')}-${index}`}
          title={group.display_value}
          count={group.count}
          sourcePaths={group.source_paths}
          recordIndexes={group.record_indexes}
          parentItems={group.parent_items}
        />
      ))}
    </div>
  )
}

function CompositeDuplicateGroupsList({ result }: { result: CompositeDuplicatesResponse }) {
  return (
    <div className="duplicate-result-list" role="list" aria-label="Composite duplicate groups list">
      {result.duplicates.map((group, groupIndex) => (
        <DuplicateResultRow
          key={`${group.key.map(formatUnknown).join('|')}-${group.record_indexes.join('-')}-${groupIndex}`}
          title={formatCompositeTitle(group)}
          count={group.count}
          sourcePaths={group.source_paths}
          recordIndexes={group.record_indexes}
          parentItems={group.parent_items}
          fieldPaths={result.field_paths}
          keyValues={group.key}
        />
      ))}
    </div>
  )
}

function DuplicateResultRow({
  title,
  count,
  sourcePaths,
  recordIndexes,
  parentItems,
  fieldPaths,
  keyValues,
}: {
  title: string
  count: AdvancedFieldDuplicateGroup['count'] | CompositeDuplicateGroup['count']
  sourcePaths: string[]
  recordIndexes: number[]
  parentItems: ParentItem[]
  fieldPaths?: string[]
  keyValues?: unknown[]
}) {
  return (
    <article className="duplicate-result-row" role="listitem">
      <div className="duplicate-result-main">
        <div>
          <strong>{title}</strong>
          {fieldPaths && keyValues ? (
            <dl className="key-detail-list duplicate-key-list">
              {fieldPaths.map((fieldPath, index) => (
                <div key={`${fieldPath}-${index}`}>
                  <dt>{fieldPath}</dt>
                  <dd>{formatUnknown(keyValues[index])}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
        <div className="value-group-meta">
          <span><strong>{formatInteger(count)}</strong> duplicates</span>
          <span>{summarizePaths(sourcePaths)}</span>
          <span>{summarizeRecords(recordIndexes)}</span>
        </div>
      </div>
      <details className="value-group-details">
        <summary>Details</summary>
        <div className="value-group-detail-grid">
          <div>
            <h5>Source paths</h5>
            <PathList paths={sourcePaths} />
          </div>
          <div>
            <h5>Records</h5>
            <p>{recordIndexes.length > 0 ? recordIndexes.join(', ') : '—'}</p>
          </div>
          <div>
            <h5>Parent items</h5>
            <ParentItems items={parentItems} />
          </div>
        </div>
      </details>
    </article>
  )
}

function formatCompositeTitle(group: CompositeDuplicateGroup): string {
  return group.key.map(formatUnknown).join(' | ')
}

function AllValuesSummary({ result }: { result: AdvancedFieldDuplicatesResponse }) {
  if (result.all_values_summary.length === 0) {
    return null
  }

  return (
    <div className="all-values-summary" aria-label="All values summary">
      <h4>All values summary</h4>
      <TableScroll label="All values summary table">
        <table>
          <thead>
            <tr>
              <th>Value</th>
              <th>Count</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {result.all_values_summary.slice(0, 12).map((summary, index) => (
              <tr key={`${summary.display_value}-${index}`}>
                <td>{summary.display_value}</td>
                <td>{formatInteger(summary.count)}</td>
                <td>{summary.is_duplicate ? 'Duplicate' : 'Unique'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>
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

function PathList({ paths }: { paths: string[] }) {
  if (paths.length === 0) {
    return <span className="muted">—</span>
  }

  return (
    <div className="source-path-list">
      {paths.slice(0, 8).map((path, index) => <code key={`${path}-${index}`}>{path}</code>)}
      {paths.length > 8 ? <span className="muted">+{formatInteger(paths.length - 8)} more</span> : null}
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
