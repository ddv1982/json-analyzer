import type { AnalysisResponse } from '../../lib/commands'
import type { ResultTab } from '../../state/useJsonAnalyzerState'
import { DuplicatesView } from './views/DuplicatesView'
import { StatisticsView } from './views/StatisticsView'
import { ValuesView } from './views/ValuesView'

export function ResultView({
  activeTab,
  analysis,
  jsonInput,
  flattenNestedArrays,
}: {
  activeTab: ResultTab
  analysis: AnalysisResponse
  jsonInput: string
  flattenNestedArrays: boolean
}) {
  switch (activeTab) {
    case 'statistics':
      return (
        <StatisticsResultView
          analysis={analysis}
          jsonInput={jsonInput}
          flattenNestedArrays={flattenNestedArrays}
        />
      )
    case 'values':
      return <ValuesView jsonInput={jsonInput} flattenNestedArrays={flattenNestedArrays} />
    case 'duplicates':
      return <DuplicatesView duplicates={analysis.exact_duplicates} />
  }
}

function StatisticsResultView({
  analysis,
  jsonInput,
  flattenNestedArrays,
}: {
  analysis: AnalysisResponse
  jsonInput: string
  flattenNestedArrays: boolean
}) {
  return (
    <section aria-label="Statistics result view">
      <StatisticsView
        statistics={analysis.statistics}
        minMaxFilled={analysis.min_max_filled}
        jsonInput={jsonInput}
        flattenNestedArrays={flattenNestedArrays}
      />
    </section>
  )
}
