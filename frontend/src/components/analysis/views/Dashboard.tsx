import type { AnalysisResponse } from '../../../lib/commands'
import { formatInteger } from '../../common/format'
import { ExactDuplicatesView } from './ExactDuplicatesView'
import { MinMaxView } from './MinMaxView'

export function Dashboard({ analysis }: { analysis: AnalysisResponse }) {
  const cards = [
    { label: 'Root type', value: analysis.structure.type },
    { label: 'Field paths', value: formatInteger(analysis.structure.field_count) },
    { label: 'Field patterns', value: formatInteger(analysis.fields.length) },
    { label: 'Exact duplicate groups', value: formatInteger(analysis.exact_duplicates.duplicate_groups) },
    { label: 'Records scored', value: formatInteger(analysis.min_max_filled.total_records) },
    { label: 'Null values', value: formatInteger(analysis.statistics.null_count) },
  ]

  return (
    <section aria-label="Dashboard summary">
      <div className="metric-grid">
        {cards.map((card) => (
          <article className="metric-card" key={card.label}>
            <span>{card.label}</span>
            <strong>{card.value}</strong>
          </article>
        ))}
      </div>
      <div className="dashboard-split">
        <ExactDuplicatesView duplicates={analysis.exact_duplicates} compact />
        <MinMaxView result={analysis.min_max_filled} compact />
      </div>
    </section>
  )
}
