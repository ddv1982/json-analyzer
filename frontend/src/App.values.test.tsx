import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  analyzeAdvancedFieldDuplicatesMock,
  analyzeCompositeDuplicatesMock,
  analyzeValuesExplorerMock,
  appConfig,
  deferred,
  discoverValuesFieldsMock,
  getConfigMock,
  loadFixtureAnalysis,
  renderApp,
  sampleJsonInput,
  setupDefaultAppMocks,
  valuesExplorerResponse,
  writeClipboardTextMock,
  type ValuesExplorerAnalysisResponse,
} from './test/app-test-harness'

describe('Values Explorer target workflow', () => {
  beforeAll(async () => {
    await loadFixtureAnalysis()
  })

  beforeEach(() => {
    setupDefaultAppMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  async function openValuesTab() {
    renderApp()
    fireEvent.click(screen.getByRole('button', { name: /analyze json/i }))
    expect(await screen.findByLabelText(/statistics result view/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: /^values$/i }))
    await screen.findByRole('button', { name: /^expand$/i })
    return screen.getByLabelText(/values explorer view/i)
  }

  async function openValuesTabShell() {
    renderApp()
    fireEvent.click(screen.getByRole('button', { name: /analyze json/i }))
    expect(await screen.findByLabelText(/statistics result view/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: /^values$/i }))
    return screen.findByLabelText(/values explorer view/i)
  }

  async function expandValuesExplorer(valuesView: HTMLElement) {
    const showButton = await within(valuesView).findByRole('button', { name: /^expand$/i })
    expect(showButton).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(showButton)
    expect(within(valuesView).getByRole('button', { name: /^collapse$/i })).toHaveAttribute('aria-expanded', 'true')
  }

  async function selectDepartment(valuesView: HTMLElement) {
    fireEvent.click(within(valuesView).getByRole('button', { name: /select field to analyze/i }))
    const listbox = await within(valuesView).findByRole('listbox', { name: /select field to analyze/i })
    fireEvent.click(within(listbox).getByRole('option', { name: /department/i }))
    await waitFor(() => {
      expect(analyzeValuesExplorerMock).toHaveBeenLastCalledWith(expect.objectContaining({
        json_string: sampleJsonInput,
        selected_fields: ['[].department'],
        filter: null,
        sort_mode: 'frequency',
        page: 1,
        page_size: 25,
        flatten: false,
      }))
    })
  }

  it('starts collapsed and does not auto-run analysis before fields are selected', async () => {
    const valuesView = await openValuesTab()

    expect(within(valuesView).getByRole('button', { name: /^expand$/i })).toHaveAttribute('aria-expanded', 'false')
    expect(analyzeValuesExplorerMock).not.toHaveBeenCalled()

    await expandValuesExplorer(valuesView)
    expect(within(valuesView).getByText(/select one or more fields to analyze duplicate combinations/i)).toBeInTheDocument()
    expect(analyzeValuesExplorerMock).not.toHaveBeenCalled()
  })

  it('renders disabled state without invoking Values commands when the feature is disabled', async () => {
    getConfigMock.mockResolvedValue({
      config: {
        ...appConfig.config,
        features: {
          ...appConfig.config.features,
          values_explorer: false,
        },
      },
    })

    await openValuesTabShell()
    expect(await screen.findByText(/values explorer disabled/i)).toBeInTheDocument()
    const valuesView = screen.getByLabelText(/values explorer view/i)

    expect(valuesView).toHaveTextContent(/disabled by configuration/i)
    expect(discoverValuesFieldsMock).not.toHaveBeenCalled()
    expect(analyzeValuesExplorerMock).not.toHaveBeenCalled()
  })

  it('runs target Values analysis after field selection and renders summary plus duplicate/all result sections', async () => {
    const valuesView = await openValuesTab()
    await expandValuesExplorer(valuesView)
    await selectDepartment(valuesView)

    const summary = await within(valuesView).findByLabelText(/values results summary/i)
    expect(summary).toHaveTextContent('Total Records')
    expect(summary).toHaveTextContent('Unique results')
    expect(summary).toHaveTextContent('Duplicate results')
    expect(summary).toHaveTextContent('Field Set')

    const duplicateSection = within(valuesView).getByLabelText(/^duplicate results/i)
    const resultsSection = within(valuesView).getByLabelText(/^results \(page/i)
    expect(duplicateSection).toHaveTextContent('Engineering')
    expect(resultsSection).toHaveTextContent('Engineering')
    expect(resultsSection).toHaveTextContent('Design')
    expect(within(valuesView).queryByLabelText(/all grouped values list/i)).not.toBeInTheDocument()
    expect(analyzeAdvancedFieldDuplicatesMock).not.toHaveBeenCalled()
    expect(analyzeCompositeDuplicatesMock).not.toHaveBeenCalled()
  })

  it('uses target filter and sort controls for follow-up analysis', async () => {
    const valuesView = await openValuesTab()
    await expandValuesExplorer(valuesView)
    await selectDepartment(valuesView)

    fireEvent.change(within(valuesView).getByLabelText(/filter field/i), { target: { value: '[].status' } })
    await waitFor(() => {
      expect(analyzeValuesExplorerMock).toHaveBeenLastCalledWith(expect.objectContaining({
        filter: null,
        page: 1,
      }))
    })

    fireEvent.change(within(valuesView).getByLabelText(/filter value/i), { target: { value: 'active' } })
    await waitFor(() => {
      expect(analyzeValuesExplorerMock).toHaveBeenLastCalledWith(expect.objectContaining({
        filter: {
          field_path: '[].status',
          value: 'active',
          match_mode: 'contains',
          case_sensitive: false,
        },
      }))
    })

    fireEvent.change(within(valuesView).getByLabelText(/sort values by/i), { target: { value: 'alphabetical' } })
    await waitFor(() => {
      expect(analyzeValuesExplorerMock).toHaveBeenLastCalledWith(expect.objectContaining({ sort_mode: 'alphabetical', page: 1 }))
    })
  })

  it('clears loading state when results are cleared during an in-flight request', async () => {
    const pendingValues = deferred<ValuesExplorerAnalysisResponse>()
    analyzeValuesExplorerMock.mockReturnValue(pendingValues.promise)

    const valuesView = await openValuesTab()
    await expandValuesExplorer(valuesView)

    fireEvent.click(within(valuesView).getByRole('button', { name: /select field to analyze/i }))
    const listbox = await within(valuesView).findByRole('listbox', { name: /select field to analyze/i })
    fireEvent.click(within(listbox).getByRole('option', { name: /department/i }))

    expect(await within(valuesView).findByRole('status')).toHaveTextContent(/loading values/i)
    fireEvent.click(within(valuesView).getByRole('button', { name: /clear results/i }))

    expect(within(valuesView).queryByText(/loading values/i)).not.toBeInTheDocument()
    expect(within(valuesView).getByText(/select one or more fields to analyze duplicate combinations/i)).toBeInTheDocument()

    pendingValues.resolve(valuesExplorerResponse({
      json_string: sampleJsonInput,
      selected_fields: ['[].department'],
      filter: null,
      sort_mode: 'frequency',
      page: 1,
      page_size: 25,
      flatten: false,
    }))
  })

  it('paginates duplicate results independently when duplicate pages exceed one page', async () => {
    analyzeValuesExplorerMock.mockImplementation((request) => Promise.resolve({
      ...valuesExplorerResponse(request),
      page: request.page,
      total_pages: 2,
      has_next_page: request.page < 2,
      duplicate_group_count: 2,
    }))

    const valuesView = await openValuesTab()
    await expandValuesExplorer(valuesView)
    await selectDepartment(valuesView)

    const duplicateSection = await within(valuesView).findByLabelText(/^duplicate results/i)
    fireEvent.click(within(duplicateSection).getByRole('button', { name: /next page/i }))

    await waitFor(() => {
      expect(analyzeValuesExplorerMock).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2, groups_page: 1 }))
    })
  })

  it('paginates all results independently from duplicate results', async () => {
    analyzeValuesExplorerMock.mockImplementation((request) => Promise.resolve({
      ...valuesExplorerResponse(request),
      groups_page: request.groups_page ?? request.page,
      groups_total_pages: 2,
    }))

    const valuesView = await openValuesTab()
    await expandValuesExplorer(valuesView)
    await selectDepartment(valuesView)

    const resultsSection = await within(valuesView).findByLabelText(/^results \(page/i)
    fireEvent.click(within(resultsSection).getByRole('button', { name: /next page/i }))

    await waitFor(() => {
      expect(analyzeValuesExplorerMock).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, groups_page: 2 }))
    })
  })

  it('renders only the requested page when Values Explorer receives a large grouped result set', async () => {
    analyzeValuesExplorerMock.mockImplementation((request) => {
      const groupOffset = ((request.groups_page ?? request.page) - 1) * request.page_size
      const duplicateOffset = (request.page - 1) * request.page_size
      const makeGroup = (index: number) => ({
        value: `Department ${index}`,
        display_value: `Department ${index}`,
        count: index % 2 === 0 ? 4 : 1,
        is_duplicate: index % 2 === 0,
        items: [
          {
            index,
            item: { id: index, department: `Department ${index}` },
            source_path: String(index),
            field_value: `Department ${index}`,
          },
        ],
      })

      return Promise.resolve({
        field_path: request.selected_fields.join(' + '),
        field_paths: request.selected_fields,
        is_composite: request.selected_fields.length > 1,
        total_items: 2_500,
        unique_values: 100,
        duplicate_group_count: 50,
        has_duplicates: true,
        duplicates: Array.from({ length: request.page_size }, (_, index) => makeGroup(duplicateOffset + index)),
        all_field_values: Array.from({ length: request.page_size }, (_, index) => makeGroup(groupOffset + index)),
        page: request.page,
        page_size: request.page_size,
        total_pages: 2,
        has_next_page: request.page < 2,
        groups_page: request.groups_page ?? request.page,
        groups_total_pages: 4,
        sort_mode: request.sort_mode,
        filter: request.filter,
      })
    })

    const valuesView = await openValuesTab()
    await expandValuesExplorer(valuesView)
    await selectDepartment(valuesView)

    const resultsSection = await within(valuesView).findByLabelText(/^results \(page 1 of 4\)/i)
    expect(within(resultsSection).getAllByRole('button', { name: /^expand group$/i })).toHaveLength(25)
    expect(resultsSection).toHaveTextContent('Department 0')
    expect(resultsSection).toHaveTextContent('Department 24')
    expect(resultsSection).not.toHaveTextContent('Department 25')
  })

  it('expands rows and copies group item JSON', async () => {
    const valuesView = await openValuesTab()
    await expandValuesExplorer(valuesView)
    await selectDepartment(valuesView)

    const duplicateSection = await within(valuesView).findByLabelText(/^duplicate results/i)
    fireEvent.click(within(duplicateSection).getAllByRole('button', { name: /^expand group$/i })[0])
    expect(within(duplicateSection).getByText(/index: 0/i)).toBeInTheDocument()
    expect(within(duplicateSection).getByText(/"Alice"/i)).toBeInTheDocument()

    fireEvent.click(within(duplicateSection).getAllByRole('button', { name: /copy group items/i })[0])
    await waitFor(() => {
      expect(writeClipboardTextMock).toHaveBeenCalledWith(expect.stringContaining('"Alice"'))
    })
  })
})
