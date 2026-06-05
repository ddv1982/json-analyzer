import { useMemo, useState } from 'react'
import type { ExactDuplicateGroup, ExactDuplicatesResult } from '../../../lib/commands'
import { useClipboardCopy } from '../../../lib/clipboard'
import { formatInteger } from '../../common/format'
import { Metric } from '../../common/Metric'
import { Badge } from '../../common/Badge'
import { CopyButton } from '../../common/CopyButton'
import { IconButton } from '../../common/IconButton'

export function ExactDuplicatesView({ duplicates, compact = false }: { duplicates: ExactDuplicatesResult; compact?: boolean }) {
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set())
  const { copiedKey, errorKey, errorMessage, copy } = useClipboardCopy(2000)
  const visibleGroups = useMemo(() => duplicates.duplicates.slice(0, compact ? 2 : duplicates.duplicates.length), [compact, duplicates.duplicates])
  const duplicateItemCount = useMemo(
    () => duplicates.duplicates.reduce((total, group) => total + group.indexes.length, 0),
    [duplicates.duplicates],
  )

  function toggleGroup(groupIndex: number) {
    setExpandedGroups((current) => {
      const next = new Set(current)
      if (next.has(groupIndex)) {
        next.delete(groupIndex)
      } else {
        next.add(groupIndex)
      }
      return next
    })
  }

  if (compact) {
    return (
      <CompactExactDuplicatesView
        duplicates={duplicates}
        visibleGroups={visibleGroups}
        expandedGroups={expandedGroups}
        copiedKey={copiedKey}
        errorKey={errorKey}
        errorMessage={errorMessage}
        onCopy={(groupIndex, text) => void copy(text, duplicateCopyKey(groupIndex))}
        onToggle={toggleGroup}
      />
    )
  }

  if (!duplicates.has_duplicates) {
    return (
      <section className="exact-duplicates-target" aria-label="Exact duplicates view">
        <div className="exact-duplicates-empty-target">
          <div className="exact-duplicates-success-icon" aria-hidden="true">
            <CheckIcon />
          </div>
          <div className="exact-duplicates-empty-copy">
            <h3>No Exact Duplicates Found</h3>
            <p>
              All {formatInteger(duplicates.unique_items)} items in your JSON data are unique. This means there are no identical objects or values.
            </p>
            {duplicates.analysis_path ? <p className="exact-duplicates-analyzed-path">Analyzed: {duplicates.analysis_path}</p> : null}
          </div>
          <div className="exact-duplicates-empty-metrics" aria-label="Exact duplicates summary">
            <TargetMetric label="Total Items" value={formatInteger(duplicates.total_items)} />
            <TargetMetric label="Unique Items" value={formatInteger(duplicates.unique_items)} />
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="exact-duplicates-target" aria-label="Exact duplicates view">
      <div className="duplicate-target-metrics" aria-label="Exact duplicates summary">
        <TargetMetric label="Total Items" value={formatInteger(duplicates.total_items)} />
        <TargetMetric label="Unique Items" value={formatInteger(duplicates.unique_items)} />
        <TargetMetric label="Duplicate Groups" value={formatInteger(duplicates.duplicate_groups)} danger />
        <TargetMetric label="Duplicate Items" value={formatInteger(duplicateItemCount)} danger />
      </div>

      <div className="duplicate-warning-callout" role="status">
        <WarningIcon />
        <div>
          <strong>Found {formatInteger(duplicates.duplicate_groups)} groups with exact duplicates</strong>
          <span>These items have identical JSON representations and may need attention.</span>
        </div>
      </div>

      <div className="duplicate-target-separator" aria-hidden="true" />

      <div className="duplicate-target-groups">
        <h3>Duplicate Groups</h3>
        <div className="duplicate-group-list" aria-label="Exact duplicate groups">
          {visibleGroups.map((group, groupIndex) => (
            <TargetDuplicateGroupCard
              key={`${group.value}-${group.indexes.join('-')}`}
              group={group}
              groupIndex={groupIndex}
              isExpanded={expandedGroups.has(groupIndex)}
              isCopied={copiedKey === duplicateCopyKey(groupIndex)}
              onCopy={(text) => void copy(text, duplicateCopyKey(groupIndex))}
              onToggle={() => toggleGroup(groupIndex)}
            />
          ))}
        </div>
      </div>
      {errorMessage ? <p className="input-help warning-text" role="status">{errorMessage}</p> : null}
    </section>
  )
}

function CompactExactDuplicatesView({
  duplicates,
  visibleGroups,
  expandedGroups,
  copiedKey,
  errorKey,
  errorMessage,
  onCopy,
  onToggle,
}: {
  duplicates: ExactDuplicatesResult
  visibleGroups: ExactDuplicateGroup[]
  expandedGroups: Set<number>
  copiedKey: string | null
  errorKey: string | null
  errorMessage: string | null
  onCopy: (groupIndex: number, text: string) => void
  onToggle: (groupIndex: number) => void
}) {
  return (
    <section className="result-card exact-duplicates-card" aria-label="Exact duplicates view">
      <div className="result-card-heading">
        <div>
          <h3>Exact duplicates</h3>
          <p className="muted">Review repeated JSON values and copy the canonical duplicate payload for a group.</p>
        </div>
        <Badge variant={duplicates.has_duplicates ? 'warning' : 'success'}>
          {duplicates.has_duplicates ? 'Duplicates found' : 'No duplicates'}
        </Badge>
      </div>
      <div className="summary-strip exact-duplicates-summary" aria-label="Exact duplicates summary">
        <Metric label="Analyzed items" value={formatInteger(duplicates.total_items)} />
        <Metric label="Unique items" value={formatInteger(duplicates.unique_items)} />
        <Metric label="Groups" value={formatInteger(duplicates.duplicate_groups)} />
      </div>
      <p className="muted">Analysis path: {duplicates.analysis_path}</p>

      {duplicates.duplicates.length === 0 ? (
        <div className="inline-empty-state exact-duplicates-empty">
          <strong>No exact duplicates found</strong>
          <span>All analyzed items have unique JSON representations.</span>
        </div>
      ) : (
        <div className="duplicate-group-list" aria-label="Exact duplicate groups">
          {visibleGroups.map((group, groupIndex) => (
            <DuplicateGroupCard
              key={`${group.value}-${group.indexes.join('-')}`}
              group={group}
              groupIndex={groupIndex}
              isExpanded={expandedGroups.has(groupIndex)}
              isCopied={copiedKey === duplicateCopyKey(groupIndex)}
              hasCopyError={errorKey === duplicateCopyKey(groupIndex)}
              onCopy={(text) => onCopy(groupIndex, text)}
              onToggle={() => onToggle(groupIndex)}
              compact
            />
          ))}
        </div>
      )}
      {errorMessage ? <p className="input-help warning-text" role="status">{errorMessage}</p> : null}
    </section>
  )
}

function TargetMetric({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return (
    <article className="duplicate-target-metric-card">
      <span>{label}</span>
      <strong className={danger ? 'danger' : undefined}>{value}</strong>
    </article>
  )
}

function TargetDuplicateGroupCard({
  group,
  groupIndex,
  isExpanded,
  isCopied,
  onCopy,
  onToggle,
}: {
  group: ExactDuplicateGroup
  groupIndex: number
  isExpanded: boolean
  isCopied: boolean
  onCopy: (text: string) => void
  onToggle: () => void
}) {
  const formattedValue = formatDuplicateValue(group.value)
  const groupNumber = groupIndex + 1

  return (
    <article className="duplicate-target-group-card">
      <div className="duplicate-target-group-header">
        <div>
          <div className="duplicate-target-group-title">
            <h4>Group #{groupNumber}</h4>
            <Badge variant="danger">{formatInteger(group.indexes.length)} duplicates</Badge>
          </div>
          <p>Found at indices: {group.indexes.join(', ')}</p>
        </div>
        <div className="inline-action-group">
          <IconButton
            aria-label={`Copy duplicate group ${groupNumber} JSON`}
            className={isCopied ? 'copied' : undefined}
            onClick={() => onCopy(formattedValue)}
          >
            {isCopied ? <CheckIcon /> : <CopyIcon />}
          </IconButton>
          <IconButton
            aria-expanded={isExpanded}
            aria-label={`${isExpanded ? 'Collapse' : 'Expand'} duplicate group ${groupNumber}`}
            onClick={onToggle}
          >
            {isExpanded ? <ChevronUpIcon /> : <ChevronDownIcon />}
          </IconButton>
        </div>
      </div>
      {isExpanded ? (
        <div className="duplicate-target-code-pane">
          <pre>{formattedValue}</pre>
        </div>
      ) : null}
    </article>
  )
}

function DuplicateGroupCard({
  group,
  groupIndex,
  isExpanded,
  isCopied,
  hasCopyError,
  onCopy,
  onToggle,
  compact,
}: {
  group: ExactDuplicateGroup
  groupIndex: number
  isExpanded: boolean
  isCopied: boolean
  hasCopyError: boolean
  onCopy: (text: string) => void
  onToggle: () => void
  compact: boolean
}) {
  const formattedValue = formatDuplicateValue(group.value)
  const groupNumber = groupIndex + 1

  return (
    <article className="duplicate-group-card">
      <div className="duplicate-group-header">
        <div className="duplicate-group-title">
          <h4>Group {groupNumber}</h4>
          <Badge variant="warning">{formatInteger(group.indexes.length)} duplicates</Badge>
        </div>
        <div className="inline-action-group">
          <CopyButton
            state={isCopied ? 'copied' : hasCopyError ? 'error' : 'idle'}
            label="Copy JSON"
            aria-label={`Copy duplicate group ${groupNumber} JSON`}
            onClick={() => onCopy(formattedValue)}
          />
          {!compact ? (
            <IconButton
              aria-expanded={isExpanded}
              aria-label={`${isExpanded ? 'Collapse' : 'Expand'} duplicate group ${groupNumber}`}
              onClick={onToggle}
            >
              {isExpanded ? '-' : '+'}
            </IconButton>
          ) : null}
        </div>
      </div>
      <p className="duplicate-indexes">
        <span>Indexes</span>
        {group.indexes.join(', ')}
      </p>
      <pre className={`preview-code duplicate-json-preview ${isExpanded || compact ? '' : 'collapsed'}`}>
        {isExpanded || compact ? formattedValue : previewDuplicateValue(formattedValue)}
      </pre>
    </article>
  )
}

function duplicateCopyKey(groupIndex: number) {
  return `exact-duplicate-${groupIndex}`
}

function formatDuplicateValue(value: string): string {
  try {
    return JSON.stringify(JSON.parse(value), null, 2)
  } catch {
    return value
  }
}

function previewDuplicateValue(value: string): string {
  if (value.length <= 280) {
    return value
  }

  return `${value.slice(0, 280)}...`
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

function ChevronDownIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

function ChevronUpIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="m18 15-6-6-6 6" />
    </svg>
  )
}

function WarningIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="m21.7 18.3-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-2.7Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  )
}
