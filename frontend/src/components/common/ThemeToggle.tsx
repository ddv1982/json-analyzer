import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { ThemePreference } from '../../state/useThemePreference'

interface ThemeToggleProps {
  preference: ThemePreference
  resolvedTheme: 'light' | 'dark'
  onPreferenceChange: (preference: ThemePreference) => void
}

const THEME_MENU_PREFERENCES: ThemePreference[] = ['system', 'light', 'dark']

export function ThemeToggle({ preference, resolvedTheme, onPreferenceChange }: ThemeToggleProps) {
  const [isOpen, setIsOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const menuItemRefs = useRef<Array<HTMLButtonElement | null>>([])
  const actionLabel = `Theme: ${resolvedTheme}. Open theme menu`

  useEffect(() => {
    if (!isOpen) {
      return undefined
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (wrapperRef.current?.contains(event.target as Node)) {
        return
      }
      setIsOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const activeIndex = Math.max(0, THEME_MENU_PREFERENCES.indexOf(preference))
    window.setTimeout(() => menuItemRefs.current[activeIndex]?.focus(), 0)
  }, [isOpen, preference])

  const choosePreference = (nextPreference: ThemePreference) => {
    onPreferenceChange(nextPreference)
    setIsOpen(false)
  }

  const handleMenuKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowRight':
        event.preventDefault()
        menuItemRefs.current[(index + 1) % THEME_MENU_PREFERENCES.length]?.focus()
        break
      case 'ArrowUp':
      case 'ArrowLeft':
        event.preventDefault()
        menuItemRefs.current[index === 0 ? THEME_MENU_PREFERENCES.length - 1 : index - 1]?.focus()
        break
      case 'Home':
        event.preventDefault()
        menuItemRefs.current[0]?.focus()
        break
      case 'End':
        event.preventDefault()
        menuItemRefs.current[THEME_MENU_PREFERENCES.length - 1]?.focus()
        break
      case 'Escape':
        event.preventDefault()
        setIsOpen(false)
        wrapperRef.current?.querySelector<HTMLButtonElement>('.theme-toggle-button')?.focus()
        break
      default:
        break
    }
  }

  return (
    <div ref={wrapperRef} className="theme-toggle" data-theme-preference={preference}>
      <button
        type="button"
        className="theme-toggle-button"
        aria-label={actionLabel}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
      >
        {resolvedTheme === 'light' ? <MoonIcon /> : <SunIcon />}
        <span className="sr-only">{actionLabel}</span>
      </button>
      {isOpen ? (
        <div className="theme-menu" role="menu" aria-label="Theme preference">
          {THEME_MENU_PREFERENCES.map((option, index) => (
            <button
              key={option}
              ref={(node) => {
                menuItemRefs.current[index] = node
              }}
              type="button"
              role="menuitemradio"
              className={preference === option ? 'theme-menu-item active' : 'theme-menu-item'}
              aria-checked={preference === option}
              onKeyDown={(event) => handleMenuKeyDown(event, index)}
              onClick={() => choosePreference(option)}
            >
              {formatPreference(option)}
            </button>
          ))}
        </div>
      ) : null}
      <p className="theme-toggle-status sr-only">Using {resolvedTheme} colors</p>
    </div>
  )
}

function formatPreference(preference: ThemePreference) {
  return preference.charAt(0).toUpperCase() + preference.slice(1)
}

function SunIcon() {
  return (
    <svg className="theme-toggle-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2.2M12 19.8V22M4.93 4.93l1.56 1.56M17.51 17.51l1.56 1.56M2 12h2.2M19.8 12H22M4.93 19.07l1.56-1.56M17.51 6.49l1.56-1.56" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg className="theme-toggle-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M20.4 14.5A7.4 7.4 0 0 1 9.5 3.6 8.6 8.6 0 1 0 20.4 14.5Z" />
    </svg>
  )
}
