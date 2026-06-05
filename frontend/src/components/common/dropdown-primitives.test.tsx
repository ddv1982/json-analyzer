import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { ComboboxSelect, type ComboboxOption } from './ComboboxSelect'
import { MultiSelectDropdown, type MultiSelectOption } from './MultiSelectDropdown'

const fieldOptions: MultiSelectOption[] = [
  { value: 'department', label: 'Department', description: 'Primary team', metadata: ['3 unique', '8 non-null'] },
  { value: 'role', label: 'Role', description: 'Job title', metadata: '4 unique' },
  { value: 'location', label: 'Location', description: 'Office city' },
]

const comboboxOptions: ComboboxOption[] = [
  { value: 'department', label: 'Department', description: 'Primary team' },
  { value: 'role', label: 'Role', description: 'Job title' },
  { value: 'status', label: 'Status', description: 'Employment state' },
]

function StatefulMultiSelect({ onChange = vi.fn() }: { onChange?: (value: string[]) => void }) {
  const [value, setValue] = useState<string[]>(['department'])
  return (
    <MultiSelectDropdown
      label="Fields"
      options={fieldOptions}
      value={value}
      maxSelected={2}
      onChange={(nextValue) => {
        setValue(nextValue)
        onChange(nextValue)
      }}
    />
  )
}

function LimitReachedMultiSelect({
  onChange = vi.fn(),
  onSelectionLimit = vi.fn(),
}: {
  onChange?: (value: string[]) => void
  onSelectionLimit?: (maxSelected: number) => void
}) {
  const [value, setValue] = useState<string[]>(['department', 'role'])
  return (
    <MultiSelectDropdown
      label="Fields"
      options={fieldOptions}
      value={value}
      maxSelected={2}
      onSelectionLimit={onSelectionLimit}
      onChange={(nextValue) => {
        setValue(nextValue)
        onChange(nextValue)
      }}
    />
  )
}

function ControlledSearchMultiSelect({ onSearchChange }: { onSearchChange: (value: string) => void }) {
  const [value, setValue] = useState<string[]>(['department'])
  const [search, setSearch] = useState('')
  return (
    <MultiSelectDropdown
      label="Fields"
      options={fieldOptions}
      value={value}
      searchValue={search}
      onSearchChange={(nextSearch) => {
        setSearch(nextSearch)
        onSearchChange(nextSearch)
      }}
      onChange={setValue}
    />
  )
}

function StatefulCombobox({ onChange = vi.fn() }: { onChange?: (value: string | null) => void }) {
  const [value, setValue] = useState<string | null>(null)
  return (
    <ComboboxSelect
      label="Filter field"
      options={comboboxOptions}
      value={value}
      onChange={(nextValue) => {
        setValue(nextValue)
        onChange(nextValue)
      }}
    />
  )
}

describe('MultiSelectDropdown', () => {
  it('exposes a button-triggered multiselect listbox and toggles options by role', async () => {
    const handleChange = vi.fn()
    render(<StatefulMultiSelect onChange={handleChange} />)

    const trigger = screen.getByRole('button', { name: /fields/i })
    expect(trigger).toHaveAttribute('aria-haspopup', 'listbox')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(trigger)

    const listbox = screen.getByRole('listbox', { name: /fields/i })
    expect(listbox).toHaveAttribute('aria-multiselectable', 'true')
    await waitFor(() => expect(listbox).toHaveFocus())

    fireEvent.click(screen.getByRole('option', { name: /role/i }))
    expect(handleChange).toHaveBeenLastCalledWith(['department', 'role'])
    expect(screen.getByRole('option', { name: /location/i })).toHaveAttribute('aria-disabled', 'true')

    fireEvent.click(screen.getByRole('option', { name: /department/i }))
    expect(handleChange).toHaveBeenLastCalledWith(['role'])
    expect(screen.getByRole('option', { name: /location/i })).not.toHaveAttribute('aria-disabled')
  })

  it('supports search, keyboard toggling, clear-all, and Escape close with focus return', async () => {
    const handleChange = vi.fn()
    render(<StatefulMultiSelect onChange={handleChange} />)

    const trigger = screen.getByRole('button', { name: /fields/i })
    fireEvent.click(trigger)

    fireEvent.change(screen.getByRole('searchbox', { name: /search fields/i }), { target: { value: 'loc' } })
    expect(screen.getByRole('option', { name: /location/i })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /department/i })).not.toBeInTheDocument()

    const searchbox = screen.getByRole('searchbox', { name: /search fields/i })
    expect(searchbox).toHaveAttribute('aria-controls', screen.getByRole('listbox', { name: /fields/i }).id)
    expect(searchbox.getAttribute('aria-activedescendant')).toMatch(/option-0$/)

    fireEvent.keyDown(searchbox, { key: 'Enter' })
    expect(handleChange).toHaveBeenLastCalledWith(['department', 'location'])

    fireEvent.click(screen.getByRole('button', { name: /clear all/i }))
    expect(handleChange).toHaveBeenLastCalledWith([])

    fireEvent.keyDown(searchbox, { key: 'Escape' })
    expect(screen.queryByRole('listbox', { name: /fields/i })).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('keeps limit-blocked options inert while selected options remain toggleable', () => {
    const handleChange = vi.fn()
    const handleSelectionLimit = vi.fn()
    render(<LimitReachedMultiSelect onChange={handleChange} onSelectionLimit={handleSelectionLimit} />)

    fireEvent.click(screen.getByRole('button', { name: /fields/i }))

    const listbox = screen.getByRole('listbox', { name: /fields/i })
    const locationOption = screen.getByRole('option', { name: /location/i })
    expect(listbox).toHaveAccessibleDescription(/2 of 2 selected\. limit reached/i)
    expect(locationOption).toHaveAttribute('aria-disabled', 'true')

    fireEvent.click(locationOption)
    expect(handleChange).not.toHaveBeenCalled()
    expect(handleSelectionLimit).toHaveBeenCalledTimes(1)
    expect(handleSelectionLimit).toHaveBeenLastCalledWith(2)

    fireEvent.keyDown(listbox, { key: 'ArrowDown' })
    fireEvent.keyDown(listbox, { key: 'ArrowDown' })
    expect(locationOption.id).toBe(listbox.getAttribute('aria-activedescendant'))

    fireEvent.keyDown(listbox, { key: 'Enter' })
    fireEvent.keyDown(listbox, { key: ' ' })
    expect(handleChange).not.toHaveBeenCalled()
    expect(handleSelectionLimit).toHaveBeenCalledTimes(3)
    expect(handleSelectionLimit).toHaveBeenLastCalledWith(2)

    fireEvent.click(screen.getByRole('option', { name: /role/i }))
    expect(handleChange).toHaveBeenLastCalledWith(['department'])
    expect(locationOption).not.toHaveAttribute('aria-disabled')
  })

  it('exposes active descendant from the search input during keyboard navigation', () => {
    render(<StatefulMultiSelect />)

    fireEvent.click(screen.getByRole('button', { name: /fields/i }))
    const searchbox = screen.getByRole('searchbox', { name: /search fields/i })
    const listbox = screen.getByRole('listbox', { name: /fields/i })

    expect(searchbox).toHaveAttribute('aria-controls', listbox.id)
    expect(searchbox.getAttribute('aria-activedescendant')).toMatch(/option-0$/)

    fireEvent.keyDown(searchbox, { key: 'ArrowDown' })
    expect(searchbox.getAttribute('aria-activedescendant')).toMatch(/option-1$/)
    expect(screen.getByRole('option', { name: /role/i }).id).toBe(searchbox.getAttribute('aria-activedescendant'))
  })

  it('notifies controlled search consumers when close resets search', () => {
    const handleSearchChange = vi.fn()
    render(<ControlledSearchMultiSelect onSearchChange={handleSearchChange} />)

    const trigger = screen.getByRole('button', { name: /fields/i })
    fireEvent.click(trigger)
    const searchbox = screen.getByRole('searchbox', { name: /search fields/i })
    fireEvent.change(searchbox, { target: { value: 'loc' } })
    expect(handleSearchChange).toHaveBeenLastCalledWith('loc')

    fireEvent.keyDown(searchbox, { key: 'Escape' })
    expect(handleSearchChange).toHaveBeenLastCalledWith('')
    expect(trigger).toHaveFocus()
  })
})

describe('ComboboxSelect', () => {
  it('filters options, selects with the keyboard, and clears the controlled value', async () => {
    const handleChange = vi.fn()
    render(<StatefulCombobox onChange={handleChange} />)

    const combobox = screen.getByRole('combobox', { name: /filter field/i })
    fireEvent.focus(combobox)
    expect(combobox).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('listbox', { name: /filter field/i })).toBeInTheDocument()

    fireEvent.change(combobox, { target: { value: 'sta' } })
    expect(screen.getByRole('option', { name: /status/i })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /^role/i })).not.toBeInTheDocument()

    fireEvent.keyDown(combobox, { key: 'Enter' })
    expect(handleChange).toHaveBeenLastCalledWith('status')
    await waitFor(() => expect(combobox).toHaveValue('Status'))
    expect(combobox).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(screen.getByRole('button', { name: /clear filter field/i }))
    expect(handleChange).toHaveBeenLastCalledWith(null)
    await waitFor(() => expect(combobox).toHaveValue(''))
  })

  it('opens from the keyboard and closes with Escape', () => {
    render(<StatefulCombobox />)

    const combobox = screen.getByRole('combobox', { name: /filter field/i })
    fireEvent.keyDown(combobox, { key: 'ArrowDown' })
    expect(combobox).toHaveAttribute('aria-expanded', 'true')

    fireEvent.keyDown(combobox, { key: 'Escape' })
    expect(combobox).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('listbox', { name: /filter field/i })).not.toBeInTheDocument()
  })
})
