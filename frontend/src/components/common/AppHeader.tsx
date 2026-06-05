import type { AppView } from '../../state/useAppUiStore'
import type { ThemePreference } from '../../state/useThemePreference'
import { ThemeToggle } from './ThemeToggle'

interface AppHeaderProps {
  activeView: AppView
  themePreference: ThemePreference
  resolvedTheme: 'light' | 'dark'
  onThemePreferenceChange: (preference: ThemePreference) => void
  onViewChange: (view: AppView) => void
}

const VIEW_COPY: Record<AppView, { title: string; subtitle: string; actionLabel: string; actionView: AppView }> = {
  'json-analyzer': {
    title: 'JSON Analyzer',
    subtitle: 'Validate JSON and explore statistics, values and duplicates.',
    actionLabel: 'Curl Executor',
    actionView: 'curl-executor',
  },
  'curl-executor': {
    title: 'Curl Executor',
    subtitle: 'Execute curl commands directly from Postman - simple, secure, and universal.',
    actionLabel: 'JSON Analyzer',
    actionView: 'json-analyzer',
  },
}

export function AppHeader({
  activeView,
  themePreference,
  resolvedTheme,
  onThemePreferenceChange,
  onViewChange,
}: AppHeaderProps) {
  const viewCopy = VIEW_COPY[activeView]

  return (
    <header className="app-header">
      <div className="header-main">
        <h1>{viewCopy.title}</h1>
        <p className="lede">{viewCopy.subtitle}</p>
      </div>
      <div className="header-aside">
        <div className="header-toolbar">
          <nav className="app-nav" aria-label="Primary navigation">
            <span className="sr-only" aria-current="page">
              Current section: {viewCopy.title}
            </span>
            <button
              type="button"
              className="nav-button"
              onClick={() => onViewChange(viewCopy.actionView)}
            >
              {viewCopy.actionLabel}
            </button>
          </nav>
          <ThemeToggle
            preference={themePreference}
            resolvedTheme={resolvedTheme}
            onPreferenceChange={onThemePreferenceChange}
          />
        </div>
      </div>
    </header>
  )
}
