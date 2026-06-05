import type { ButtonHTMLAttributes } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'nav'

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: 'primary-action',
  secondary: '',
  danger: 'danger-action',
  nav: 'nav-button',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
}

/**
 * Shared button primitive. Maps a semantic `variant` onto the existing global
 * button classes so styling stays token-driven and consistent everywhere.
 * Defaults to `type="button"` to avoid accidental form submission.
 */
export function Button({ variant = 'secondary', className, type = 'button', ...rest }: ButtonProps) {
  const classes = [VARIANT_CLASS[variant], className].filter(Boolean).join(' ')

  return <button type={type} className={classes || undefined} {...rest} />
}
