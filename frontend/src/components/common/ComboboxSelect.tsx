import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'

export interface ComboboxOption {
  value: string
  label: string
  description?: string
  disabled?: boolean
}

interface ComboboxSelectProps {
  id?: string
  label: string
  options: ComboboxOption[]
  value: string | null
  onChange: (value: string | null) => void
  placeholder?: string
  loading?: boolean
  error?: string | null
  emptyMessage?: string
  disabled?: boolean
}

function useStableId(providedId: string | undefined, prefix: string) {
  const generatedId = useId().replace(/:/g, '')
  return providedId ?? `${prefix}-${generatedId}`
}

function optionMatches(option: ComboboxOption, query: string) {
  return [option.label, option.value, option.description]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .includes(query.toLowerCase())
}

/**
 * ARIA model: editable combobox with a controlled single value and an
 * associated listbox. Focus stays on the input while arrow keys update
 * aria-activedescendant; Enter chooses the active option and Escape closes.
 */
export function ComboboxSelect({
  id,
  label,
  options,
  value,
  onChange,
  placeholder = 'Select an option',
  loading = false,
  error = null,
  emptyMessage = 'No options found.',
  disabled = false,
}: ComboboxSelectProps) {
  const baseId = useStableId(id, 'combobox-select')
  const listboxId = `${baseId}-listbox`
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const skipNextFocusOpenRef = useRef(false)
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)

  const selectedOption = useMemo(() => options.find((option) => option.value === value) ?? null, [options, value])
  const filteredOptions = useMemo(
    () => options.filter((option) => (search.trim() ? optionMatches(option, search.trim()) : true)),
    [options, search],
  )
  const inputValue = isOpen ? search : selectedOption?.label ?? ''

  useEffect(() => {
    if (!isOpen) {
      return undefined
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (wrapperRef.current?.contains(event.target as Node)) {
        return
      }
      setIsOpen(false)
      setSearch('')
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [isOpen])

  useEffect(() => {
    if (activeIndex > filteredOptions.length - 1) {
      setActiveIndex(Math.max(filteredOptions.length - 1, 0))
    }
  }, [activeIndex, filteredOptions.length])

  const openCombobox = () => {
    if (disabled) {
      return
    }
    setSearch('')
    setActiveIndex(Math.max(filteredOptions.findIndex((option) => option.value === value), 0))
    setIsOpen(true)
  }

  const closeCombobox = () => {
    setIsOpen(false)
    setSearch('')
  }

  const selectOption = (option: ComboboxOption | undefined) => {
    if (!option || option.disabled) {
      return
    }
    onChange(option.value)
    closeCombobox()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen && ['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
      event.preventDefault()
      openCombobox()
      return
    }

    if (!isOpen) {
      return
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        setActiveIndex((index) => (filteredOptions.length === 0 ? 0 : (index + 1) % filteredOptions.length))
        break
      case 'ArrowUp':
        event.preventDefault()
        setActiveIndex((index) => (filteredOptions.length === 0 ? 0 : index === 0 ? filteredOptions.length - 1 : index - 1))
        break
      case 'Home':
        event.preventDefault()
        setActiveIndex(0)
        break
      case 'End':
        event.preventDefault()
        setActiveIndex(Math.max(filteredOptions.length - 1, 0))
        break
      case 'Enter':
        event.preventDefault()
        selectOption(filteredOptions[activeIndex])
        break
      case 'Escape':
        event.preventDefault()
        closeCombobox()
        break
      default:
        break
    }
  }

  return (
    <div ref={wrapperRef} className="dropdown-field combobox-select">
      <label id={`${baseId}-label`} className="control-label" htmlFor={`${baseId}-input`}>
        {label}
      </label>
      <div className="combobox-input-row">
        <input
          ref={inputRef}
          id={`${baseId}-input`}
          className="text-input combobox-input"
          role="combobox"
          type="text"
          value={inputValue}
          placeholder={placeholder}
          disabled={disabled}
          aria-autocomplete="list"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          aria-activedescendant={isOpen && filteredOptions[activeIndex] ? `${baseId}-option-${activeIndex}` : undefined}
          aria-labelledby={`${baseId}-label`}
          onFocus={() => {
            if (skipNextFocusOpenRef.current) {
              skipNextFocusOpenRef.current = false
              return
            }
            openCombobox()
          }}
          onChange={(event) => {
            setSearch(event.target.value)
            setActiveIndex(0)
            setIsOpen(true)
          }}
          onKeyDown={handleKeyDown}
        />
        {value ? (
          <button
            type="button"
            className="combobox-clear"
            aria-label={`Clear ${label}`}
            disabled={disabled}
            onClick={() => {
              onChange(null)
              closeCombobox()
              skipNextFocusOpenRef.current = true
              inputRef.current?.focus()
            }}
          >
            Clear
          </button>
        ) : null}
      </div>

      {isOpen ? (
        <div className="dropdown-popover combobox-popover">
          {error ? <div className="dropdown-state error-state" role="alert">{error}</div> : null}
          {loading ? <div className="dropdown-state loading-state" role="status">Loading options…</div> : null}
          {!loading && !error && filteredOptions.length === 0 ? <div className="dropdown-state empty-state-small">{emptyMessage}</div> : null}

          {!loading && !error && filteredOptions.length > 0 ? (
            <div id={listboxId} className="dropdown-listbox" role="listbox" aria-labelledby={`${baseId}-label`}>
              {filteredOptions.map((option, index) => {
                const selected = option.value === value
                return (
                  <div
                    key={option.value}
                    id={`${baseId}-option-${index}`}
                    className={`dropdown-option${selected ? ' selected' : ''}${activeIndex === index ? ' active' : ''}${
                      option.disabled ? ' disabled' : ''
                    }`}
                    role="option"
                    aria-selected={selected}
                    aria-disabled={option.disabled || undefined}
                    onMouseEnter={() => setActiveIndex(index)}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => selectOption(option)}
                  >
                    <span className="dropdown-option-check" aria-hidden="true">
                      {selected ? '✓' : ''}
                    </span>
                    <span className="dropdown-option-body">
                      <span className="dropdown-option-label">{option.label}</span>
                      {option.description ? <span className="dropdown-option-description">{option.description}</span> : null}
                    </span>
                  </div>
                )
              })}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
