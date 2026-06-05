import type { MinMaxFilledResult, MinMaxRecord } from '../../../lib/commands'
import { Metric } from '../../common/Metric'
import { Badge } from '../../common/Badge'
import { formatDecimal, formatInteger, formatPercent } from '../../common/format'

export function MinMaxView({ result, compact = false }: { result: MinMaxFilledResult; compact?: boolean }) {
  return (
    <section className="result-card" aria-label="Basic min max view">
      <div className="result-card-heading">
        <h3>Min/max filled fields</h3>
        <Badge variant={result.has_records ? 'success' : 'warning'}>
          {result.has_records ? 'Records scored' : 'No records'}
        </Badge>
      </div>
      <div className="metric-grid compact-metrics">
        <Metric label="Records" value={formatInteger(result.total_records)} />
        <Metric label="Avg filled" value={formatDecimal(result.statistics.avg_filled_fields)} />
        <Metric label="Avg completeness" value={formatPercent(result.statistics.avg_completeness_pct)} />
      </div>
      <p className="muted">Analysis path: {result.analysis_path}</p>
      {result.has_records ? (
        <div className="record-grid">
          <RecordList title="Minimum filled" records={result.min_records} compact={compact} />
          <RecordList title="Maximum filled" records={result.max_records} compact={compact} />
        </div>
      ) : null}
    </section>
  )
}

function RecordList({ title, records, compact }: { title: string; records: MinMaxRecord[]; compact: boolean }) {
  return (
    <div>
      <h4>{title}</h4>
      <table>
        <thead>
          <tr>
            <th>Index</th>
            <th>Filled</th>
            <th>Completeness</th>
          </tr>
        </thead>
        <tbody>
          {records.slice(0, compact ? 1 : 10).map((record) => (
            <tr key={`${title}-${record.index}`}>
              <td>{record.index}</td>
              <td>{record.filled_count}/{record.total_fields}</td>
              <td>{formatPercent(record.completeness_pct)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
