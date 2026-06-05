import { useState } from 'react'
import { AnalysisResultsPanel } from './components/analysis/AnalysisResultsPanel'
import { AppHeader, type AppView } from './components/common/AppHeader'
import { CurlExecutorView } from './components/curl-executor/CurlExecutorView'
import { JsonInputPanel } from './components/json-input/JsonInputPanel'
import { useJsonAnalyzerState } from './state/useJsonAnalyzerState'
import { useThemePreference } from './state/useThemePreference'

export default function App() {
  const analyzer = useJsonAnalyzerState()
  const theme = useThemePreference()
  const [activeView, setActiveView] = useState<AppView>('json-analyzer')

  return (
    <main className="app-shell">
      <AppHeader
        activeView={activeView}
        themePreference={theme.preference}
        resolvedTheme={theme.resolvedTheme}
        onThemePreferenceChange={theme.setPreference}
        onViewChange={setActiveView}
      />

      {activeView === 'json-analyzer' ? (
      <section className="workspace-grid" aria-label="JSON analysis workspace">
        <JsonInputPanel
          jsonInput={analyzer.jsonInput}
          inputByteCount={analyzer.inputByteCount}
          validation={analyzer.validation}
          error={analyzer.inputError}
          busyAction={analyzer.busyAction}
          flattenNestedArrays={analyzer.flattenNestedArrays}
          hasInput={analyzer.hasInput}
          isBusy={analyzer.isBusy}
          isDebouncedValidating={analyzer.isDebouncedValidating}
          onClear={analyzer.handleClear}
          onFlattenNestedArraysChange={analyzer.handleFlattenNestedArraysChange}
          onFormat={analyzer.handleFormat}
          onJsonInputChange={analyzer.handleJsonInputChange}
          onLoadExample={analyzer.handleLoadExample}
        />

        <AnalysisResultsPanel
          activeTab={analyzer.activeTab}
          analysis={analyzer.analysis}
          analysisError={analyzer.analysisError}
          busyAction={analyzer.busyAction}
          hasInput={analyzer.hasInput}
          jsonInput={analyzer.jsonInput}
          flattenNestedArrays={analyzer.flattenNestedArrays}
          onActiveTabChange={analyzer.setActiveTab}
          onAnalyze={analyzer.handleAnalyze}
          onClearResults={analyzer.handleClearResults}
        />
      </section>
      ) : (
        <CurlExecutorView />
      )}
    </main>
  )
}
