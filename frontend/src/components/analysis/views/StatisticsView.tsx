import type { MinMaxFilledResult, MinMaxRecord, StatisticsAnalysis } from '../../../lib/commands'
import { formatDecimal, formatInteger, formatPercent } from '../../common/format'
import { Metric } from '../../common/Metric'
import { Badge } from '../../common/Badge'

export function StatisticsView({
  statistics,
  minMaxFilled,
  jsonInput,
  flattenNestedArrays,
}: {
  statistics: StatisticsAnalysis
  minMaxFilled: MinMaxFilledResult
  jsonInput: string
  flattenNestedArrays: boolean
}) {
  const recordPreviews = recordsFromJsonInput(
    jsonInput,
    minMaxFilled.analysis_path,
    minMaxFilled.total_records,
    flattenNestedArrays,
  )
  const maxRecord = minMaxFilled.max_records[0]
  const minRecord = minMaxFilled.min_records[0]

  return (
    <section className="statistics-view" aria-label="Statistics view">
      <div className="metric-grid compact-metrics">
        <Metric label="Total Fields" value={formatInteger(statistics.total_fields)} />
        <Metric label="Unique Paths" value={formatInteger(statistics.unique_field_paths)} />
        <Metric label="Null Values" value={formatInteger(statistics.null_count)} />
      </div>

      {statistics.string_length_stats.count > 0 ? (
        <section className="result-card" aria-label="String length statistics">
          <div className="result-card-heading">
            <h3>String Length Statistics</h3>
          </div>
          <div className="metric-grid compact-metrics">
            <Metric label="String Fields" value={formatInteger(statistics.string_length_stats.count)} />
            <Metric label="Min Length" value={formatInteger(statistics.string_length_stats.min)} />
            <Metric label="Max Length" value={formatInteger(statistics.string_length_stats.max)} />
            <Metric label="Avg Length" value={formatDecimal(statistics.string_length_stats.avg)} />
          </div>
        </section>
      ) : null}

      <section className="result-card" aria-label="Data completeness">
        <div className="result-card-heading">
          <div>
            <h3>Data Completeness</h3>
            <p className="muted">Analysis path: {minMaxFilled.analysis_path}</p>
          </div>
          <div className="input-status-group" aria-label="Completeness summary">
            <Badge variant={minMaxFilled.has_records ? 'info' : 'warning'}>
              {minMaxFilled.has_records ? `${formatInteger(minMaxFilled.total_records)} records` : 'No records'}
            </Badge>
            {maxRecord ? (
              <Badge variant="success">Max: {formatInteger(maxRecord.filled_count)} fields</Badge>
            ) : null}
            {minRecord ? (
              <Badge variant="success">Min: {formatInteger(minRecord.filled_count)} fields</Badge>
            ) : null}
          </div>
        </div>

        {minMaxFilled.has_records ? (
          <div className="record-grid">
            {maxRecord ? (
              <CompletenessRecord
                title="Record with maximum filled fields"
                record={maxRecord}
                preview={recordPreviews?.[maxRecord.index]}
              />
            ) : null}
            {minRecord ? (
              <CompletenessRecord
                title="Record with minimum filled fields"
                record={minRecord}
                preview={recordPreviews?.[minRecord.index]}
              />
            ) : null}
          </div>
        ) : (
          <p className="muted">No suitable array found for data completeness scoring.</p>
        )}
      </section>
    </section>
  )
}

function CompletenessRecord({
  title,
  record,
  preview,
}: {
  title: string
  record: MinMaxRecord
  preview: unknown
}) {
  return (
    <article className="metric-card">
      <div className="result-card-heading">
        <div>
          <h4>{title}</h4>
          <p className="muted">Record index {formatInteger(record.index)}</p>
        </div>
        <Badge variant="info">
          {formatInteger(record.filled_count)}/{formatInteger(record.total_fields)} fields ·{' '}
          {formatPercent(record.completeness_pct)}
        </Badge>
      </div>
      {preview === undefined ? (
        <p className="muted">Normalized JSON preview unavailable for this analysis path.</p>
      ) : (
        <details>
          <summary>Show normalized JSON preview</summary>
          <pre className="preview-code">{formatJsonPreview(preview)}</pre>
        </details>
      )}
    </article>
  )
}

function recordsFromJsonInput(
  jsonInput: string,
  analysisPath: string,
  expectedRecordCount: number,
  flattenNestedArrays: boolean,
): unknown[] | null {
  try {
    const parsed = JSON.parse(jsonInput) as unknown
    const normalized = flattenNestedArrays ? flattenOneLevelIfListOfLists(parsed) ?? parsed : parsed
    const candidatePath = pathFromAnalysisPath(analysisPath)
    const candidate = candidatePath === 'root' ? normalized : valueAtPath(normalized, candidatePath)
    if (Array.isArray(candidate)) {
      return candidate
    }

    return findObjectArray(normalized, expectedRecordCount)
  } catch {
    return null
  }
}

function pathFromAnalysisPath(analysisPath: string): string {
  return analysisPath.replace(/ \(\d+ items\)$/, '')
}

function flattenOneLevelIfListOfLists(value: unknown): unknown[] | null {
  if (!Array.isArray(value) || value.length === 0 || !value.every(Array.isArray)) {
    return null
  }

  return value.flatMap((item) => item as unknown[])
}

function valueAtPath(value: unknown, path: string): unknown {
  if (!path) {
    return value
  }

  return path.split('.').reduce<unknown>((current, segment) => {
    if (current === undefined || current === null) {
      return undefined
    }

    if (Array.isArray(current)) {
      const index = Number(segment)
      return Number.isInteger(index) ? current[index] : undefined
    }

    if (typeof current === 'object') {
      return (current as Record<string, unknown>)[segment]
    }

    return undefined
  }, value)
}

function findObjectArray(value: unknown, expectedRecordCount: number): unknown[] | null {
  if (Array.isArray(value)) {
    const containsObject = value.some((item) => typeof item === 'object' && item !== null && !Array.isArray(item))
    if (containsObject && (expectedRecordCount === 0 || value.length === expectedRecordCount)) {
      return value
    }
  }

  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) {
      const match = findObjectArray(child, expectedRecordCount)
      if (match) {
        return match
      }
    }
  }

  return null
}

function formatJsonPreview(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? String(value)
  } catch {
    return String(value)
  }
}
