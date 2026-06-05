import type { ButtonHTMLAttributes } from 'react'

type IconButtonBaseProps = ButtonHTMLAttributes<HTMLButtonElement>
type IconButtonAccessibleName =
  | { 'aria-label': string; 'aria-labelledby'?: string }
  | { 'aria-label'?: string; 'aria-labelledby': string }

export type IconButtonProps = IconButtonBaseProps & IconButtonAccessibleName

/**
 * Square icon-only button (expand/collapse, etc.). Wraps the global
 * `.icon-action-button` styling. Provide an accessible name with `aria-label`
 * or `aria-labelledby`.
 */
export function IconButton({ className, type = 'button', ...rest }: IconButtonProps) {
  const classes = ['icon-action-button', className].filter(Boolean).join(' ')

  return <button type={type} className={classes} {...rest} />
}
