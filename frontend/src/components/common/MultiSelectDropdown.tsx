import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'

export interface MultiSelectOption {
  value: string
  label: string
  description?: string
  metadata?: string | string[]
  disabled?: boolean
}

interface MultiSelectDropdownProps {
  id?: string
  label: string
  options: MultiSelectOption[]
  value: string[]
  onChange: (value: string[]) => void
  maxSelected?: number
  placeholder?: string
  searchPlaceholder?: string
  searchValue?: string
  onSearchChange?: (value: string) => void
  onSelectionLimit?: (maxSelected: number) => void
  loading?: boolean
  error?: string | null
  emptyMessage?: string
  disabled?: boolean
}

function includesQuery(option: MultiSelectOption, query: string) {
  const haystack = [
    option.label,
    option.value,
    option.description,
    ...(Array.isArray(option.metadata) ? option.metadata : [option.metadata]),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return haystack.includes(query.toLowerCase())
}

function useStableId(providedId: string | undefined, prefix: string) {
  const generatedId = useId().replace(/:/g, '')
  return providedId ?? `${prefix}-${generatedId}`
}

/**
 * ARIA model: button-triggered multi-select listbox. The trigger owns
 * aria-expanded/aria-controls, and the popover contains a searchable
 * role="listbox" with aria-multiselectable options toggled by click,
 * Enter, or Space using aria-activedescendant for keyboard focus.
 */
export function MultiSelectDropdown({
  id,
  label,
  options,
  value,
  onChange,
  maxSelected,
  placeholder = 'Select options',
  searchPlaceholder = 'Search options',
  searchValue,
  onSearchChange,
  onSelectionLimit,
  loading = false,
  error = null,
  emptyMessage = 'No options found.',
  disabled = false,
}: MultiSelectDropdownProps) {
  const baseId = useStableId(id, 'multi-select')
  const listboxId = `${baseId}-listbox`
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const popoverRef = useRef<HTMLDivElement | null>(null)
  const listboxRef = useRef<HTMLDivElement | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [internalSearch, setInternalSearch] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const isSearchControlled = searchValue !== undefined
  const search = searchValue ?? internalSearch

  const updateSearch = (nextSearch: string) => {
    if (!isSearchControlled) {
      setInternalSearch(nextSearch)
    }
    onSearchChange?.(nextSearch)
  }

  const resetSearch = () => {
    if (!isSearchControlled) {
      setInternalSearch('')
    }
    onSearchChange?.('')
  }

  const selectedOptions = useMemo(() => options.filter((option) => value.includes(option.value)), [options, value])
  const filteredOptions = useMemo(
    () => options.filter((option) => (search.trim() ? includesQuery(option, search.trim()) : true)),
    [options, search],
  )
  const clampedActiveIndex = filteredOptions.length > 0 ? Math.min(activeIndex, filteredOptions.length - 1) : 0
  const activeOption = filteredOptions[clampedActiveIndex]
  const activeOptionId = activeOption ? `${baseId}-option-${clampedActiveIndex}` : undefined
  const selectedCount = value.length
  const isAtLimit = typeof maxSelected === 'number' && selectedCount >= maxSelected
  const helperTextId = `${baseId}-help`
  const selectedLabels = selectedOptions.map((option) => option.label)
  const hiddenSelectedCount = Math.max(0, value.length - selectedLabels.length)
  const summary =
    value.length === 0
      ? placeholder
      : selectedLabels.length === 0
        ? `${value.length} selected`
        : hiddenSelectedCount > 0
          ? `${value.length} selected: ${selectedLabels.join(', ')} + ${hiddenSelectedCount} more`
          : `${value.length} selected: ${selectedLabels.join(', ')}`

  useEffect(() => {
    if (!isOpen) {
      return undefined
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (popoverRef.current?.contains(target) || triggerRef.current?.contains(target)) {
        return
      }
      setIsOpen(false)
      resetSearch()
      triggerRef.current?.focus()
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [isOpen])

  useEffect(() => {
    if (activeIndex > filteredOptions.length - 1) {
      setActiveIndex(Math.max(filteredOptions.length - 1, 0))
    }
  }, [activeIndex, filteredOptions.length])

  const openDropdown = () => {
    if (disabled) {
      return
    }
    setIsOpen(true)
    window.setTimeout(() => listboxRef.current?.focus(), 0)
  }

  const closeDropdown = () => {
    setIsOpen(false)
    resetSearch()
    triggerRef.current?.focus()
  }

  const isOptionInert = (option: MultiSelectOption) => {
    const selected = value.includes(option.value)
    return option.disabled || (!selected && isAtLimit)
  }

  const toggleOption = (option: MultiSelectOption) => {
    const selected = value.includes(option.value)
    if (option.disabled) {
      return
    }
    if (!selected && isAtLimit) {
      if (typeof maxSelected === 'number') {
        onSelectionLimit?.(maxSelected)
      }
      return
    }
    onChange(selected ? value.filter((selectedValue) => selectedValue !== option.value) : [...value, option.value])
  }

  const handleOptionKeyDown = (event: KeyboardEvent<HTMLElement>, options: { allowSpaceToggle: boolean }) => {
    if (filteredOptions.length === 0) {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeDropdown()
      }
      return
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        setActiveIndex((index) => (index + 1) % filteredOptions.length)
        break
      case 'ArrowUp':
        event.preventDefault()
        setActiveIndex((index) => (index === 0 ? filteredOptions.length - 1 : index - 1))
        break
      case 'Home':
        event.preventDefault()
        setActiveIndex(0)
        break
      case 'End':
        event.preventDefault()
        setActiveIndex(filteredOptions.length - 1)
        break
      case 'Enter':
        event.preventDefault()
        if (activeOption) {
          toggleOption(activeOption)
        }
        break
      case ' ':
        if (options.allowSpaceToggle) {
          event.preventDefault()
          if (activeOption) {
            toggleOption(activeOption)
          }
        }
        break
      case 'Escape':
        event.preventDefault()
        closeDropdown()
        break
      default:
        break
    }
  }

  return (
    <div className="dropdown-field multi-select-dropdown">
      <span id={`${baseId}-label`} className="control-label">
        {label}
      </span>
      <button
        ref={triggerRef}
        id={`${baseId}-trigger`}
        type="button"
        className="dropdown-trigger"
        aria-labelledby={`${baseId}-label ${baseId}-trigger-summary`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        disabled={disabled}
        onClick={() => {
          if (isOpen) {
            closeDropdown()
          } else {
            openDropdown()
          }
        }}
      >
        <span id={`${baseId}-trigger-summary`} className="dropdown-trigger-summary">
          {summary}
        </span>
        <span className="dropdown-trigger-meta" aria-hidden="true">
          {selectedCount}{typeof maxSelected === 'number' ? `/${maxSelected}` : ''}
        </span>
      </button>

      {isOpen ? (
        <div ref={popoverRef} className="dropdown-popover">
          <div className="dropdown-search-row">
            <input
              className="text-input dropdown-search"
              type="search"
              value={search}
              aria-label={`Search ${label}`}
              aria-controls={listboxId}
              aria-activedescendant={activeOptionId}
              placeholder={searchPlaceholder}
              onChange={(event) => {
                updateSearch(event.target.value)
                setActiveIndex(0)
              }}
              onKeyDown={(event) => handleOptionKeyDown(event, { allowSpaceToggle: false })}
            />
            {selectedCount > 0 ? (
              <button type="button" className="dropdown-clear" onClick={() => onChange([])}>
                Clear all
              </button>
            ) : null}
          </div>

          {typeof maxSelected === 'number' ? (
            <p id={helperTextId} className="dropdown-help" role={isAtLimit ? 'status' : undefined}>
              {selectedCount} of {maxSelected} selected{isAtLimit ? '. Limit reached; deselect an option before choosing another.' : ''}
            </p>
          ) : null}

          {error ? <div className="dropdown-state error-state" role="alert">{error}</div> : null}
          {loading ? <div className="dropdown-state loading-state" role="status">Loading options…</div> : null}
          {!loading && !error && filteredOptions.length === 0 ? <div className="dropdown-state empty-state-small">{emptyMessage}</div> : null}

          {!loading && !error && filteredOptions.length > 0 ? (
            <div
              ref={listboxRef}
              id={listboxId}
              className="dropdown-listbox"
              role="listbox"
              aria-labelledby={`${baseId}-label`}
              aria-multiselectable="true"
              aria-activedescendant={activeOptionId}
              aria-describedby={typeof maxSelected === 'number' ? helperTextId : undefined}
              tabIndex={-1}
              onKeyDown={(event) => handleOptionKeyDown(event, { allowSpaceToggle: true })}
            >
              {filteredOptions.map((option, index) => {
                const selected = value.includes(option.value)
                const optionDisabled = isOptionInert(option)
                const metadata = Array.isArray(option.metadata) ? option.metadata : option.metadata ? [option.metadata] : []
                return (
                  <div
                    key={option.value}
                    id={`${baseId}-option-${index}`}
                    className={`dropdown-option${selected ? ' selected' : ''}${clampedActiveIndex === index ? ' active' : ''}${
                      optionDisabled ? ' disabled' : ''
                    }`}
                    role="option"
                    aria-selected={selected}
                    aria-disabled={optionDisabled || undefined}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => toggleOption(option)}
                  >
                    <span className="dropdown-option-check" aria-hidden="true">
                      {selected ? '✓' : ''}
                    </span>
                    <span className="dropdown-option-body">
                      <span className="dropdown-option-label">{option.label}</span>
                      {option.description ? <span className="dropdown-option-description">{option.description}</span> : null}
                      {metadata.length > 0 ? (
                        <span className="dropdown-option-metadata">{metadata.join(' · ')}</span>
                      ) : null}
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
