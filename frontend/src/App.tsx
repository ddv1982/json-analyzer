import { AppProviders } from './app/query-client'
import type { QueryClient } from '@tanstack/react-query'
import { AnalysisResultsPanel } from './components/analysis/AnalysisResultsPanel'
import { AppHeader } from './components/common/AppHeader'
import { JsonInputPanel } from './components/json-input/JsonInputPanel'
import { CurlExecutorView } from './features/curl-executor'
import { useJsonAnalyzerController } from './features/json-analysis/useJsonAnalyzerController'
import { useAppUiStore } from './state/useAppUiStore'
import { useThemePreference } from './state/useThemePreference'

interface AppProps {
  queryClient?: QueryClient
}

export default function App({ queryClient }: AppProps) {
  return (
    <AppProviders queryClient={queryClient}>
      <AppContent />
    </AppProviders>
  )
}

function AppContent() {
  const analyzer = useJsonAnalyzerController()
  const theme = useThemePreference()
  const activeView = useAppUiStore((state) => state.activeView)
  const setActiveView = useAppUiStore((state) => state.setActiveView)

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
