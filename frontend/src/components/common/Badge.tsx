import type { HTMLAttributes } from 'react'

export type BadgeVariant = 'neutral' | 'success' | 'warning' | 'info' | 'danger'

const VARIANT_CLASS: Record<BadgeVariant, string> = {
  neutral: 'meta-pill',
  success: 'status-badge success',
  warning: 'status-badge warning',
  info: 'status-badge info',
  danger: 'status-badge danger',
}

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant
}

/**
 * Small status/label pill. Maps a semantic `variant` onto the existing badge
 * classes so the scattered `status-badge` / `meta-pill` usages share one API.
 */
export function Badge({ variant = 'neutral', className, ...rest }: BadgeProps) {
  const classes = [VARIANT_CLASS[variant], className].filter(Boolean).join(' ')

  return <span className={classes} {...rest} />
}
