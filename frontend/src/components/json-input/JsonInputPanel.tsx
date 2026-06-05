import type { ProblemDetails, ValidateResponse } from '../../lib/commands'
import type { BusyAction } from '../../state/useJsonAnalyzerState'
import { ErrorPanel, LoadingPanel, ValidationSummary } from '../common/StatusPanels'
import { formatInteger } from '../common/format'
import { Badge } from '../common/Badge'
import { Button } from '../common/Button'

interface JsonInputPanelProps {
  busyAction: BusyAction
  error: ProblemDetails | null
  flattenNestedArrays: boolean
  hasInput: boolean
  inputByteCount: number
  isBusy: boolean
  isDebouncedValidating: boolean
  jsonInput: string
  onClear: () => void
  onFlattenNestedArraysChange: (flattenNestedArrays: boolean) => void
  onFormat: () => void
  onJsonInputChange: (jsonInput: string) => void
  onLoadExample: () => void
  validation: ValidateResponse | null
}

export function JsonInputPanel({
  busyAction,
  error,
  flattenNestedArrays,
  hasInput,
  inputByteCount,
  isBusy,
  isDebouncedValidating,
  jsonInput,
  onClear,
  onFlattenNestedArraysChange,
  onFormat,
  onJsonInputChange,
  onLoadExample,
  validation,
}: JsonInputPanelProps) {
  return (
    <section className="panel input-panel" aria-labelledby="json-input-heading">
      <div className="panel-heading">
        <div>
          <p className="section-kicker">JSON Input</p>
          <h2 id="json-input-heading">JSON Input</h2>
        </div>
        <div className="input-status-group" aria-label="Input status">
          <Badge variant="neutral">{formatInteger(inputByteCount)} bytes</Badge>
          <Badge variant={validation?.valid ? 'success' : 'neutral'}>
            {isDebouncedValidating
              ? 'Validating…'
              : error
                ? 'Invalid JSON'
                : validation?.valid
                  ? 'Valid JSON'
                  : 'Ready for input'}
          </Badge>
        </div>
      </div>

      <textarea
        aria-label="JSON input"
        value={jsonInput}
        onChange={(event) => {
          onJsonInputChange(event.target.value)
        }}
        disabled={isBusy}
        spellCheck={false}
      />

      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={flattenNestedArrays}
          onChange={(event) => {
            onFlattenNestedArraysChange(event.target.checked)
          }}
          disabled={isBusy}
        />
        <span>Flatten nested arrays for analysis</span>
      </label>
      <p className="input-help">Combine one level of nested arrays for analysis. Validation remains strict.</p>

      <div className="action-row">
        <Button onClick={onLoadExample} disabled={isBusy}>
          Load Example
        </Button>
        <Button onClick={onFormat} disabled={!hasInput || isBusy}>
          {busyAction === 'format' ? 'Formatting…' : 'Format'}
        </Button>
        <Button onClick={onClear} disabled={!hasInput || isBusy}>
          Clear
        </Button>
      </div>

      {validation ? <ValidationSummary validation={validation} /> : null}
      {error ? <ErrorPanel error={error} /> : null}
      {isBusy && busyAction !== 'analyze' ? <LoadingPanel action={busyAction} /> : null}
    </section>
  )
}
