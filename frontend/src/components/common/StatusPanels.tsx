import type { ProblemDetails, ValidateResponse } from '../../lib/commands'
import type { BusyAction } from '../../state/useJsonAnalyzerState'
import { Button } from './Button'

export function BrowserMockNotice() {
  return (
    <aside className="state-card mock-state" aria-label="Browser mock mode">
      Browser-only Vite development is using golden-fixture-backed command mocks. Tauri desktop
      command IPC remains the authoritative integration path.
    </aside>
  )
}

export function ValidationSummary({ validation }: { validation: ValidateResponse }) {
  return (
    <aside className="state-card success-state" aria-label="Validation result">
      <strong>JSON is valid.</strong>
      <span>{validation.document_count} document root{validation.document_count === 1 ? '' : 's'} detected.</span>
      {validation.warnings.length > 0 ? (
        <ul>
          {validation.warnings.map((warning) => (
            <li key={`${warning.warning_type}-${warning.detail}`}>{warning.detail}</li>
          ))}
        </ul>
      ) : null}
    </aside>
  )
}

export function ErrorPanel({ error }: { error: ProblemDetails }) {
  return (
    <aside className="state-card error-state" role="alert" aria-label="Command error">
      <strong>{error.title}</strong>
      <span>{error.detail}</span>
      {error.position ? (
        <span>
          Line {error.position.line}, column {error.position.column}
        </span>
      ) : null}
    </aside>
  )
}

export function LoadingPanel({ action }: { action: BusyAction }) {
  const label = action === 'format' ? 'Formatting JSON…' : action === 'validate' ? 'Validating JSON…' : 'Analyzing JSON…'

  return (
    <aside className="state-card loading-state" role="status">
      {label}
    </aside>
  )
}

export function EmptyState({ onAnalyze, hasInput }: { onAnalyze: () => void; hasInput: boolean }) {
  return (
    <div className="empty-state">
      <h3>Ready to Analyze</h3>
      <p>Validate JSON and explore statistics, values and duplicates.</p>
      <Button variant="primary" onClick={onAnalyze} disabled={!hasInput}>
        Analyze JSON
      </Button>
    </div>
  )
}
