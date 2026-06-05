import { useMemo, useState } from 'react'
import type { ExactDuplicateGroup, ExactDuplicatesResult } from '../../../lib/commands'
import { useClipboardCopy } from '../../../lib/clipboard'
import { formatInteger } from '../../common/format'
import { Metric } from '../../common/Metric'

export function ExactDuplicatesView({ duplicates, compact = false }: { duplicates: ExactDuplicatesResult; compact?: boolean }) {
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set())
  const { copiedKey, errorKey, errorMessage, copy } = useClipboardCopy(2000)
  const visibleGroups = useMemo(() => duplicates.duplicates.slice(0, compact ? 2 : 20), [compact, duplicates.duplicates])
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

  return (
    <section className="result-card exact-duplicates-card" aria-label="Exact duplicates view">
      <div className="result-card-heading">
        <div>
          <h3>Exact duplicates</h3>
          <p className="muted">Review repeated JSON values and copy the canonical duplicate payload for a group.</p>
        </div>
        <span className={duplicates.has_duplicates ? 'status-badge warning' : 'status-badge'}>
          {duplicates.has_duplicates ? 'Duplicates found' : 'No duplicates'}
        </span>
      </div>
      <div className="summary-strip exact-duplicates-summary" aria-label="Exact duplicates summary">
        <Metric label="Analyzed items" value={formatInteger(duplicates.total_items)} />
        <Metric label="Unique items" value={formatInteger(duplicates.unique_items)} />
        <Metric label="Groups" value={formatInteger(duplicates.duplicate_groups)} />
        {!compact ? <Metric label="Duplicate items" value={formatInteger(duplicateItemCount)} /> : null}
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
              onCopy={(text) => void copy(text, duplicateCopyKey(groupIndex))}
              onToggle={() => toggleGroup(groupIndex)}
              compact={compact}
            />
          ))}
          {!compact && duplicates.duplicates.length > visibleGroups.length ? (
            <p className="input-help">Showing {formatInteger(visibleGroups.length)} of {formatInteger(duplicates.duplicates.length)} duplicate groups.</p>
          ) : null}
        </div>
      )}
      {errorMessage ? <p className="input-help warning-text" role="status">{errorMessage}</p> : null}
    </section>
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
          <span className="status-badge warning">{formatInteger(group.indexes.length)} duplicates</span>
        </div>
        <div className="inline-action-group">
          <button
            type="button"
            className={`copy-button ${isCopied ? 'copied' : ''} ${hasCopyError ? 'error' : ''}`}
            aria-label={`Copy duplicate group ${groupNumber} JSON`}
            onClick={() => onCopy(formattedValue)}
          >
            {isCopied ? 'Copied' : hasCopyError ? 'Copy failed' : 'Copy JSON'}
          </button>
          {!compact ? (
            <button
              type="button"
              className="icon-action-button"
              aria-expanded={isExpanded}
              aria-label={`${isExpanded ? 'Collapse' : 'Expand'} duplicate group ${groupNumber}`}
              onClick={onToggle}
            >
              {isExpanded ? '-' : '+'}
            </button>
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
