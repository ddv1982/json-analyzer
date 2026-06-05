import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  analyzeJsonMock,
  analyzeValuesExplorerMock,
  deferred,
  discoverValuesFieldsMock,
  fixtureAnalysis,
  invalidJsonProblem,
  loadFixtureAnalysis,
  renderApp,
  sampleJsonInput,
  setupDefaultAppMocks,
  validateJsonMock,
  validationOk,
  writeClipboardTextMock,
  type AnalysisResponse,
  type ValidateResponse,
} from './test/app-test-harness'

describe('App frontend MVP workflow', () => {
  beforeAll(async () => {
    await loadFixtureAnalysis()
  })

  beforeEach(() => {
    setupDefaultAppMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows results-owned loading and validation success states during analysis', async () => {
    const deferredValidation = deferred<ValidateResponse>()
    validateJsonMock.mockReturnValueOnce(deferredValidation.promise)

    renderApp()
    fireEvent.click(screen.getByRole('button', { name: /analyze json/i }))

    expect(screen.getByRole('status')).toHaveTextContent(/analyzing json/i)
    deferredValidation.resolve(validationOk)

    expect(await screen.findByLabelText(/validation result/i)).toHaveTextContent(/json is valid/i)
    expect(validateJsonMock).toHaveBeenCalledWith({ json_string: sampleJsonInput })
  })

  it('runs validate then analyze and renders all core success views', async () => {
    renderApp()
    fireEvent.click(screen.getByRole('button', { name: /analyze json/i }))

    expect(await screen.findByLabelText(/statistics result view/i)).toBeInTheDocument()
    expect(validateJsonMock).toHaveBeenCalledWith({ json_string: sampleJsonInput })
    expect(analyzeJsonMock).toHaveBeenCalledWith({
      json_string: sampleJsonInput,
      min_max_deep: true,
      flatten: false,
    })

    const statisticsView = screen.getByLabelText(/statistics view/i)
    expect(statisticsView).toHaveTextContent('Total Fields')
    expect(statisticsView).toHaveTextContent('Unique Paths')
    expect(statisticsView).toHaveTextContent('Null Values')
    expect(statisticsView).toHaveTextContent('String Length Statistics')
    expect(statisticsView).toHaveTextContent('String Fields')
    expect(statisticsView).toHaveTextContent('Min Length')
    expect(statisticsView).toHaveTextContent('Max Length')
    expect(statisticsView).toHaveTextContent('Avg Length')

    const dataCompleteness = within(statisticsView).getByLabelText(/data completeness/i)
    expect(dataCompleteness).toHaveTextContent('Data Completeness')
    expect(dataCompleteness).toHaveTextContent('Record with maximum filled fields')
    expect(dataCompleteness).toHaveTextContent('Record with minimum filled fields')
    expect(within(dataCompleteness).getAllByText(/show normalized json preview/i).length).toBeGreaterThan(0)
    expect(dataCompleteness).toHaveTextContent(/"name":\s*"Bob"/)
    expect(dataCompleteness).toHaveTextContent(/"name":\s*"Alice"/)

    expect(screen.queryByText('Field patterns')).not.toBeInTheDocument()
    expect(screen.queryByText('Exact duplicate groups')).not.toBeInTheDocument()
    expect(screen.queryByText('Type distribution')).not.toBeInTheDocument()
    expect(screen.queryByText('Value distribution sample')).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/structure view/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/field list view/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/basic min max view/i)).not.toBeInTheDocument()

    expect(screen.queryByRole('tab', { name: /dashboard/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: /structure/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: /^fields$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: /exact duplicates/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: /min\/max filled/i })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: /^duplicates$/i }))
    const duplicatesView = screen.getByLabelText(/duplicates result view/i)
    const exactDuplicatesView = within(duplicatesView).getByLabelText(/exact duplicates view/i)
    const formattedDuplicateJson = JSON.stringify(JSON.parse(fixtureAnalysis.exact_duplicates.duplicates[0].value), null, 2)
    expect(exactDuplicatesView).toHaveTextContent('Total Items')
    expect(exactDuplicatesView).toHaveTextContent('Unique Items')
    expect(exactDuplicatesView).toHaveTextContent('Duplicate Groups')
    expect(exactDuplicatesView).toHaveTextContent('Duplicate Items')
    expect(exactDuplicatesView).toHaveTextContent(`Found ${fixtureAnalysis.exact_duplicates.duplicate_groups} groups with exact duplicates`)
    expect(exactDuplicatesView).toHaveTextContent('These items have identical JSON representations and may need attention.')
    expect(exactDuplicatesView).toHaveTextContent('Duplicate Groups')
    expect(exactDuplicatesView).toHaveTextContent('Group #1')
    expect(within(exactDuplicatesView).getByText('Found at indices: 0, 2')).toBeInTheDocument()
    expect(within(exactDuplicatesView).getByLabelText(/exact duplicate groups/i)).toBeInTheDocument()
    expect(findPreWithText(exactDuplicatesView, formattedDuplicateJson)).toBeNull()

    fireEvent.click(within(exactDuplicatesView).getByRole('button', { name: /expand duplicate group 1/i }))
    expect(findPreWithText(exactDuplicatesView, formattedDuplicateJson)).toBeInTheDocument()

    fireEvent.click(within(exactDuplicatesView).getByRole('button', { name: /collapse duplicate group 1/i }))
    expect(findPreWithText(exactDuplicatesView, formattedDuplicateJson)).toBeNull()

    const copyDuplicateJsonButton = within(exactDuplicatesView).getByRole('button', { name: /copy duplicate group 1 json/i })
    fireEvent.click(copyDuplicateJsonButton)
    await waitFor(() => {
      expect(writeClipboardTextMock).toHaveBeenCalledWith(formattedDuplicateJson)
    })
    expect(copyDuplicateJsonButton).toHaveClass('copied')
    expect(within(duplicatesView).queryByLabelText(/duplicate analysis workflow/i)).not.toBeInTheDocument()
    expect(within(duplicatesView).queryByRole('button', { name: /find duplicates/i })).not.toBeInTheDocument()
  })

  it('exposes three analysis result tabs with tablist semantics and keyboard navigation', async () => {
    renderApp()
    fireEvent.click(screen.getByRole('button', { name: /analyze json/i }))

    expect(await screen.findByLabelText(/statistics result view/i)).toBeInTheDocument()
    const tablist = screen.getByRole('tablist', { name: /analysis result views/i })
    const tabs = within(tablist).getAllByRole('tab')
    const statisticsTab = within(tablist).getByRole('tab', { name: /^statistics$/i })
    const valuesTab = within(tablist).getByRole('tab', { name: /^values$/i })
    const duplicatesTab = within(tablist).getByRole('tab', { name: /^duplicates$/i })
    const panel = screen.getByRole('tabpanel')

    expect(tabs).toHaveLength(3)
    expect(statisticsTab).toHaveAccessibleName('Statistics')
    expect(valuesTab).toHaveAccessibleName('Values')
    expect(duplicatesTab).toHaveAccessibleName('Duplicates')
    expect(within(duplicatesTab).getByText(String(fixtureAnalysis.exact_duplicates.duplicate_groups))).toBeInTheDocument()
    expect(statisticsTab).toHaveAttribute('aria-selected', 'true')
    expect(statisticsTab).toHaveAttribute('tabIndex', '0')
    expect(valuesTab).toHaveAttribute('aria-selected', 'false')
    expect(valuesTab).toHaveAttribute('tabIndex', '-1')
    expect(statisticsTab).toHaveAttribute('aria-controls', panel.id)
    expect(panel).toHaveAttribute('aria-labelledby', statisticsTab.id)
    for (const tab of tabs) {
      expect(document.getElementById(tab.getAttribute('aria-controls') ?? '')).toBeInTheDocument()
    }

    fireEvent.keyDown(statisticsTab, { key: 'ArrowRight' })
    expect(valuesTab).toHaveFocus()
    expect(valuesTab).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', valuesTab.id)
    expect(await screen.findByRole('button', { name: /^expand$/i })).toBeInTheDocument()

    fireEvent.keyDown(valuesTab, { key: 'End' })
    expect(duplicatesTab).toHaveFocus()
    expect(duplicatesTab).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByLabelText(/exact duplicates view/i)).toHaveTextContent('Found 1 groups with exact duplicates')

    fireEvent.keyDown(duplicatesTab, { key: 'Home' })
    expect(statisticsTab).toHaveFocus()
    expect(statisticsTab).toHaveAttribute('aria-selected', 'true')
  })

  it('sends the flatten analysis option when enabled', async () => {
    renderApp()

    fireEvent.click(screen.getByRole('checkbox', { name: /flatten nested arrays/i }))
    fireEvent.click(screen.getByRole('button', { name: /analyze json/i }))

    expect(await screen.findByLabelText(/statistics result view/i)).toBeInTheDocument()
    expect(analyzeJsonMock).toHaveBeenCalledWith({
      json_string: sampleJsonInput,
      min_max_deep: true,
      flatten: true,
    })

    fireEvent.click(screen.getByRole('tab', { name: /^values$/i }))
    await waitFor(() => {
      expect(discoverValuesFieldsMock).toHaveBeenCalledWith(
        expect.objectContaining({ flatten: true, json_string: sampleJsonInput }),
      )
    })

    const valuesView = await screen.findByLabelText(/values explorer view/i)
    fireEvent.click(within(valuesView).getByRole('button', { name: /^expand$/i }))
    fireEvent.click(within(valuesView).getByRole('button', { name: /select field to analyze/i }))
    const listbox = await within(valuesView).findByRole('listbox', { name: /select field to analyze/i })
    fireEvent.click(within(listbox).getByRole('option', { name: /department/i }))

    await waitFor(() => {
      expect(analyzeValuesExplorerMock).toHaveBeenCalledWith(
        expect.objectContaining({ flatten: true, json_string: sampleJsonInput }),
      )
    })
  })

  it('renders data completeness previews from flattened records when flatten is enabled', async () => {
    const nestedInput = JSON.stringify([
      [{ name: 'Alice', role: 'Developer' }, { name: 'Bob' }],
      [{ name: 'Carol', role: 'Lead', location: 'Amsterdam' }],
    ])
    const flattenedAnalysis = JSON.parse(JSON.stringify(fixtureAnalysis)) as AnalysisResponse
    flattenedAnalysis.min_max_filled = {
      analysis_path: 'root',
      total_records: 3,
      min_records: [{ index: 1, filled_count: 1, total_fields: 3, completeness_pct: 33.3333333333 }],
      max_records: [{ index: 2, filled_count: 3, total_fields: 3, completeness_pct: 100 }],
      statistics: {
        total_records: 3,
        avg_filled_fields: 2,
        median_filled_fields: 2,
        std_filled_fields: 0.8164965809,
        avg_completeness_pct: 66.6666666667,
        field_count_distribution: [
          { filled_count: 1, count: 1 },
          { filled_count: 2, count: 1 },
          { filled_count: 3, count: 1 },
        ],
      },
      has_records: true,
    }
    analyzeJsonMock.mockResolvedValueOnce(flattenedAnalysis)

    renderApp()
    fireEvent.change(screen.getByRole('textbox', { name: /json input/i }), { target: { value: nestedInput } })
    fireEvent.click(screen.getByRole('checkbox', { name: /flatten nested arrays/i }))
    fireEvent.click(screen.getByRole('button', { name: /analyze json/i }))

    const dataCompleteness = await screen.findByLabelText(/data completeness/i)
    expect(dataCompleteness).toHaveTextContent(/"name":\s*"Bob"/)
    expect(dataCompleteness).toHaveTextContent(/"name":\s*"Carol"/)
    expect(dataCompleteness).not.toHaveTextContent(/normalized json preview unavailable/i)
  })

  it('renders structured command errors from wrappers', async () => {
    validateJsonMock.mockRejectedValueOnce(invalidJsonProblem)

    renderApp()
    fireEvent.click(screen.getByRole('button', { name: /analyze json/i }))

    const alerts = await screen.findAllByRole('alert')
    expect(alerts[0]).toHaveTextContent('Unexpected token }')
    expect(alerts[0]).toHaveTextContent('Line 1, column 18')
    expect(alerts[1]).toHaveTextContent('Unexpected token }')
    expect(alerts[1]).toHaveTextContent('Line 1, column 18')
    expect(analyzeJsonMock).not.toHaveBeenCalled()
  })

  it('keeps validation success input-owned when core analysis fails', async () => {
    analyzeJsonMock.mockRejectedValueOnce({
      error_type: 'analysis_error',
      title: 'Analysis failed',
      status: 500,
      detail: 'Statistics could not be computed',
      instance: null,
    })

    renderApp()
    fireEvent.click(screen.getByRole('button', { name: /analyze json/i }))

    expect(await screen.findByLabelText(/validation result/i)).toHaveTextContent(/json is valid/i)
    expect(screen.getByLabelText(/input status/i)).toHaveTextContent(/valid json/i)
    const resultsPanel = screen.getByRole('region', { name: /analysis results/i })
    const alert = await within(resultsPanel).findByRole('alert')
    expect(alert).toHaveTextContent('Analysis failed')
    expect(alert).toHaveTextContent('Statistics could not be computed')
    expect(within(resultsPanel).getByRole('button', { name: /try again/i })).toBeEnabled()
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(analyzeJsonMock).toHaveBeenCalledWith({
      json_string: sampleJsonInput,
      min_max_deep: true,
      flatten: false,
    })
  })

  it('renders no-duplicates and no-records states for valid scalar/non-record analysis', async () => {
    const noRecordsAnalysis = JSON.parse(JSON.stringify(fixtureAnalysis)) as AnalysisResponse
    noRecordsAnalysis.exact_duplicates = {
      total_items: 0,
      unique_items: 0,
      duplicate_groups: 0,
      duplicates: [],
      has_duplicates: false,
      analysis_path: 'No suitable array found',
    }
    noRecordsAnalysis.min_max_filled = {
      analysis_path: 'No suitable array found',
      total_records: 0,
      min_records: [],
      max_records: [],
      statistics: {
        total_records: 0,
        avg_filled_fields: 0,
        median_filled_fields: 0,
        std_filled_fields: 0,
        avg_completeness_pct: 0,
        field_count_distribution: [],
      },
      has_records: false,
    }
    analyzeJsonMock.mockResolvedValueOnce(noRecordsAnalysis)

    renderApp()
    fireEvent.click(screen.getByRole('button', { name: /analyze json/i }))

    expect(await screen.findByLabelText(/statistics result view/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: /^duplicates$/i }))
    const duplicatesTab = screen.getByRole('tab', { name: /^duplicates$/i })
    const exactDuplicatesView = screen.getByLabelText(/exact duplicates view/i)
    expect(within(duplicatesTab).queryByText('0')).not.toBeInTheDocument()
    expect(exactDuplicatesView).toHaveTextContent('No Exact Duplicates Found')
    expect(exactDuplicatesView).toHaveTextContent('All 0 items in your JSON data are unique. This means there are no identical objects or values.')
    expect(exactDuplicatesView).toHaveTextContent('Analyzed: No suitable array found')
    expect(exactDuplicatesView).toHaveTextContent('Total Items')
    expect(exactDuplicatesView).toHaveTextContent('Unique Items')

    fireEvent.click(screen.getByRole('tab', { name: /^statistics$/i }))
    const dataCompleteness = screen.getByLabelText(/data completeness/i)
    expect(dataCompleteness).toHaveTextContent('No records')
    expect(dataCompleteness).toHaveTextContent('No suitable array found')
    expect(screen.queryByLabelText(/basic min max view/i)).not.toBeInTheDocument()
  })
})

function findPreWithText(container: HTMLElement, text: string): HTMLElement | null {
  return Array.from(container.querySelectorAll('pre')).find((pre) => pre.textContent === text) ?? null
}
