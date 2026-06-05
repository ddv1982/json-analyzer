import type { ButtonHTMLAttributes } from 'react'

export type CopyButtonState = 'idle' | 'copied' | 'error'

export interface CopyButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** Derived from the clipboard hook by the caller (e.g. copiedKey === key). */
  state?: CopyButtonState
  /** Label shown in the idle state. */
  label?: string
  copiedLabel?: string
  errorLabel?: string
  /** Renders at intrinsic width instead of stretching to fill its container. */
  compact?: boolean
}

/**
 * Presentational copy button. Centralizes the copied/error state classes and
 * label switching that were previously duplicated across every view, so all
 * copy affordances look and behave identically. State is owned by the caller
 * (typically via `useClipboardCopy`).
 */
export function CopyButton({
  state = 'idle',
  label = 'Copy',
  copiedLabel = 'Copied',
  errorLabel = 'Copy failed',
  compact = false,
  className,
  type = 'button',
  ...rest
}: CopyButtonProps) {
  const classes = [
    'copy-button',
    compact ? 'compact' : '',
    state === 'copied' ? 'copied' : '',
    state === 'error' ? 'error' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  const text = state === 'copied' ? copiedLabel : state === 'error' ? errorLabel : label
  const liveText = state === 'idle' ? '' : text

  return (
    <>
      <button type={type} className={classes} {...rest}>
        {text}
      </button>
      {liveText ? (
        <span className="sr-only" aria-live="polite" aria-atomic="true">
          {liveText}
        </span>
      ) : null}
    </>
  )
}
