import { type KeyboardEvent, useRef } from 'react'
import type { AnalysisResponse, ProblemDetails } from '../../lib/commands'
import type { BusyAction, ResultTab } from '../../state/useJsonAnalyzerState'
import { EmptyState, ErrorPanel, LoadingPanel } from '../common/StatusPanels'
import { ResultView } from './ResultView'

const RESULT_TABS: { id: ResultTab; label: string }[] = [
  { id: 'statistics', label: 'Statistics' },
  { id: 'values', label: 'Values' },
  { id: 'duplicates', label: 'Duplicates' },
]

const tabIdFor = (tabId: ResultTab) => `analysis-results-tab-${tabId}`
const panelIdFor = (tabId: ResultTab) => `analysis-results-panel-${tabId}`

interface AnalysisResultsPanelProps {
  activeTab: ResultTab
  analysis: AnalysisResponse | null
  analysisError: ProblemDetails | null
  busyAction: BusyAction
  hasInput: boolean
  jsonInput: string
  flattenNestedArrays: boolean
  onActiveTabChange: (activeTab: ResultTab) => void
  onAnalyze: () => void
  onClearResults: () => void
}

export function AnalysisResultsPanel({
  activeTab,
  analysis,
  analysisError,
  busyAction,
  hasInput,
  jsonInput,
  flattenNestedArrays,
  onActiveTabChange,
  onAnalyze,
  onClearResults,
}: AnalysisResultsPanelProps) {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const isAnalyzing = busyAction === 'analyze'

  const focusTabAt = (index: number) => {
    const tab = RESULT_TABS[index]
    if (!tab) {
      return
    }
    onActiveTabChange(tab.id)
    tabRefs.current[index]?.focus()
  }

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const lastIndex = RESULT_TABS.length - 1
    let nextIndex: number | null = null

    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        nextIndex = index === lastIndex ? 0 : index + 1
        break
      case 'ArrowLeft':
      case 'ArrowUp':
        nextIndex = index === 0 ? lastIndex : index - 1
        break
      case 'Home':
        nextIndex = 0
        break
      case 'End':
        nextIndex = lastIndex
        break
      default:
        return
    }

    event.preventDefault()
    focusTabAt(nextIndex)
  }

  return (
    <section className="panel results-panel" aria-labelledby="analysis-results-heading">
      <div className="panel-heading">
        <div>
          <p className="section-kicker">Analysis</p>
          <h2 id="analysis-results-heading">Analysis Results</h2>
        </div>
        {analysis ? <span className="meta-pill success-pill">Ready</span> : <span className="meta-pill">Ready to Analyze</span>}
      </div>

      {isAnalyzing ? (
        <LoadingPanel action={busyAction} />
      ) : analysisError ? (
        <div className="results-state-stack">
          <ErrorPanel error={analysisError} />
          <button type="button" className="primary-action" onClick={onAnalyze} disabled={!hasInput}>
            Try Again
          </button>
        </div>
      ) : analysis ? (
        <>
          <div className="results-actions" aria-label="Analysis actions">
            <button type="button" className="primary-action" onClick={onAnalyze} disabled={!hasInput}>
              Re-analyze
            </button>
            <button type="button" onClick={onClearResults}>
              Clear Results
            </button>
          </div>
          <div className="tab-list" role="tablist" aria-label="Analysis result views" aria-orientation="horizontal">
            {RESULT_TABS.map((tab, index) => {
              const isActive = tab.id === activeTab
              return (
                <button
                  key={tab.id}
                  ref={(node) => {
                    tabRefs.current[index] = node
                  }}
                  id={tabIdFor(tab.id)}
                  type="button"
                  role="tab"
                  className={isActive ? 'tab active' : 'tab'}
                  aria-selected={isActive}
                  aria-controls={panelIdFor(tab.id)}
                  tabIndex={isActive ? 0 : -1}
                  onClick={() => {
                    onActiveTabChange(tab.id)
                  }}
                  onKeyDown={(event) => handleTabKeyDown(event, index)}
                >
                  {tab.label}
                </button>
              )
            })}
          </div>
          {RESULT_TABS.map((tab) => {
            const isActive = tab.id === activeTab
            return (
              <div
                key={tab.id}
                id={panelIdFor(tab.id)}
                className="tab-panel"
                role="tabpanel"
                aria-labelledby={tabIdFor(tab.id)}
                tabIndex={isActive ? 0 : -1}
                hidden={!isActive}
              >
                {isActive ? (
                  <ResultView
                    activeTab={activeTab}
                    analysis={analysis}
                    jsonInput={jsonInput}
                    flattenNestedArrays={flattenNestedArrays}
                  />
                ) : null}
              </div>
            )
          })}
        </>
      ) : (
        <EmptyState onAnalyze={onAnalyze} hasInput={hasInput} />
      )}
    </section>
  )
}
