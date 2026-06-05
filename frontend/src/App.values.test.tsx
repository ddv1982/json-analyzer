import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  analyzeAdvancedFieldDuplicatesMock,
  analyzeCompositeDuplicatesMock,
  analyzeValuesMock,
  appConfig,
  deferred,
  discoverValuesFieldsMock,
  getConfigMock,
  loadFixtureAnalysis,
  renderApp,
  sampleJsonInput,
  setupDefaultAppMocks,
  valuesResponse,
  writeClipboardTextMock,
  type ValuesAnalysisRequest,
  type ValuesAnalysisResponse,
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

  it('renders Values Explorer and sends local search, sort, pagination, and page-size controls', async () => {
    renderApp()
    fireEvent.click(screen.getByRole('button', { name: /analyze json/i }))

    expect(await screen.findByLabelText(/statistics result view/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: /^values$/i }))

    const valuesView = await screen.findByLabelText(/values explorer view/i)
    await waitFor(() => {
      expect(discoverValuesFieldsMock).toHaveBeenCalledWith({
        json_string: sampleJsonInput,
        search: null,
        limit: null,
        flatten: false,
      })
    })
    expect(await within(valuesView).findByText('Engineering')).toBeInTheDocument()
    expect(within(valuesView).getByLabelText(/selected field set/i)).toHaveTextContent('Department')
    expect(getConfigMock).toHaveBeenCalled()
    expect(within(valuesView).getByRole('button', { name: /select fields/i })).toHaveTextContent('1/5')
    const valuesResultView = screen.getByLabelText(/values result view/i)
    expect(within(valuesResultView).queryByRole('button', { name: /open field duplicate workflow/i })).not.toBeInTheDocument()
    expect(within(valuesResultView).queryByLabelText(/duplicate analysis workflow/i)).not.toBeInTheDocument()
    expect(within(valuesView).getByLabelText(/values results summary/i)).toHaveTextContent('Duplicates')
    expect(within(valuesView).getByLabelText(/values results summary/i)).toHaveTextContent('Page values')
    expect(within(valuesView).getAllByText(/duplicate group/i).length).toBeGreaterThan(0)
    expect(within(valuesView).getAllByText(/repeated values/i).length).toBeGreaterThan(0)
    expect(within(valuesView).getByRole('checkbox', { name: /duplicate groups only/i })).toBeEnabled()
    expect(within(valuesView).getByRole('button', { name: /copy duplicate summary/i })).toBeEnabled()
    const copyValueGroupButton = within(valuesView).getByRole('button', { name: /copy value group 1 json records/i })
    expect(copyValueGroupButton).toBeEnabled()
    fireEvent.click(copyValueGroupButton)
    await waitFor(() => {
      expect(writeClipboardTextMock).toHaveBeenCalledWith(
        JSON.stringify({ id: 1, name: 'Alice', department: 'Engineering' }, null, 2),
      )
    })
    expect(copyValueGroupButton).toHaveTextContent(/copied/i)

    writeClipboardTextMock.mockClear()
    fireEvent.click(within(valuesView).getByRole('button', { name: /copy fields/i }))
    await waitFor(() => {
      expect(writeClipboardTextMock).toHaveBeenCalledWith('[].department')
    })

    fireEvent.click(within(valuesView).getByRole('button', { name: /select fields/i }))
    const fieldSearchBox = within(valuesView).getByRole('searchbox', { name: /search select fields/i })
    fireEvent.change(fieldSearchBox, { target: { value: 'role' } })
    await waitFor(() => {
      expect(discoverValuesFieldsMock).toHaveBeenLastCalledWith({
        json_string: sampleJsonInput,
        search: 'role',
        limit: null,
        flatten: false,
      })
    })
    fireEvent.change(fieldSearchBox, { target: { value: '' } })
    await waitFor(() => {
      expect(discoverValuesFieldsMock).toHaveBeenLastCalledWith({
        json_string: sampleJsonInput,
        search: null,
        limit: null,
        flatten: false,
      })
    })

    expect(within(valuesView).getByText('0.department')).toBeInTheDocument()
    expect(within(valuesView).getByText(/Record 0/i)).toBeInTheDocument()

    fireEvent.click(within(valuesView).getByRole('button', { name: /next/i }))
    await waitFor(() => {
      expect(analyzeValuesMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 2, selected_fields: ['[].department'] }),
      )
    })

    fireEvent.change(within(valuesView).getByLabelText(/value search/i), { target: { value: 'sup' } })
    fireEvent.change(within(valuesView).getByLabelText(/sort by/i), { target: { value: 'value' } })
    fireEvent.change(within(valuesView).getByLabelText(/page size/i), { target: { value: '10' } })

    await waitFor(() => {
      expect(analyzeValuesMock).toHaveBeenLastCalledWith({
        json_string: sampleJsonInput,
        selected_fields: ['[].department'],
        search: 'sup',
        sort: { by: 'value', direction: 'desc' },
        page: 1,
        page_size: 10,
        include_parent_items: true,
        flatten: false,
      })
    })
    expect(await within(valuesView).findByText('Support')).toBeInTheDocument()
  })

  it('clears stale grouped values while a new Values Explorer request is pending', async () => {
    const pendingValues = deferred<ValuesAnalysisResponse>()
    let pendingRequest: ValuesAnalysisRequest | null = null
    analyzeValuesMock.mockImplementation((request) => {
      if (request.search === 'sup') {
        pendingRequest = request
        return pendingValues.promise
      }
      return Promise.resolve(valuesResponse(request))
    })

    renderApp()
    fireEvent.click(screen.getByRole('button', { name: /analyze json/i }))

    expect(await screen.findByLabelText(/statistics result view/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: /^values$/i }))

    const valuesView = await screen.findByLabelText(/values explorer view/i)
    expect(await within(valuesView).findByLabelText(/grouped values list/i)).toHaveTextContent('Engineering')

    fireEvent.change(within(valuesView).getByLabelText(/value search/i), { target: { value: 'sup' } })
    await waitFor(() => {
      expect(analyzeValuesMock).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'sup' }))
    })

    expect(within(valuesView).getByRole('status')).toHaveTextContent(/loading grouped values/i)
    expect(within(valuesView).queryByLabelText(/grouped values list/i)).not.toBeInTheDocument()

    if (!pendingRequest) {
      throw new Error('Expected a pending Values Explorer request')
    }
    pendingValues.resolve(valuesResponse(pendingRequest))
    expect(await within(valuesView).findByText('Support')).toBeInTheDocument()
  })

  it('filters grouped Values results to duplicate groups without launching a second workflow', async () => {
    renderApp()
    fireEvent.click(screen.getByRole('button', { name: /analyze json/i }))

    expect(await screen.findByLabelText(/statistics result view/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: /^values$/i }))

    const valuesResultView = await screen.findByLabelText(/values result view/i)
    const valuesView = await within(valuesResultView).findByLabelText(/values explorer view/i)
    const groupedValuesList = await within(valuesView).findByLabelText(/grouped values list/i)
    expect(groupedValuesList).toHaveTextContent('Engineering')
    expect(groupedValuesList).toHaveTextContent('Design')
    expect(within(valuesResultView).queryByRole('button', { name: /open field duplicate workflow/i })).not.toBeInTheDocument()
    expect(within(valuesResultView).queryByLabelText(/duplicate analysis workflow/i)).not.toBeInTheDocument()

    fireEvent.click(within(valuesView).getByRole('checkbox', { name: /duplicate groups only/i }))

    const filteredGroupedValuesList = within(valuesView).getByLabelText(/grouped values list/i)
    expect(filteredGroupedValuesList).toHaveTextContent('Engineering')
    expect(filteredGroupedValuesList).not.toHaveTextContent('Design')
    expect(within(valuesView).getByLabelText(/values pagination/i)).toHaveTextContent(/1 duplicate groups on page/i)

    fireEvent.change(within(valuesView).getByLabelText(/value search/i), { target: { value: 'des' } })
    await waitFor(() => {
      expect(analyzeValuesMock).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'des' }))
    })
    const duplicateOnlyCheckbox = within(valuesView).getByRole('checkbox', { name: /duplicate groups only/i })
    expect(await within(valuesView).findByText(/no duplicate groups on this page/i)).toBeInTheDocument()
    expect(duplicateOnlyCheckbox).toBeEnabled()

    fireEvent.click(duplicateOnlyCheckbox)
    const uniqueOnlyList = within(valuesView).getByLabelText(/grouped values list/i)
    expect(uniqueOnlyList).toHaveTextContent('Design')
    expect(analyzeAdvancedFieldDuplicatesMock).not.toHaveBeenCalled()
    expect(analyzeCompositeDuplicatesMock).not.toHaveBeenCalled()
  })

  it('does not mount Values duplicate workflow when advanced duplicates are disabled', async () => {
    getConfigMock.mockResolvedValue({
      config: {
        ...appConfig.config,
        features: {
          ...appConfig.config.features,
          advanced_duplicates: false,
        },
      },
    })

    renderApp()
    fireEvent.click(screen.getByRole('button', { name: /analyze json/i }))

    expect(await screen.findByLabelText(/statistics result view/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: /^values$/i }))

    const valuesResultView = await screen.findByLabelText(/values result view/i)
    const valuesView = await within(valuesResultView).findByLabelText(/values explorer view/i)
    expect(await within(valuesView).findByText('Engineering')).toBeInTheDocument()
    expect(within(valuesResultView).queryByRole('button', { name: /open field duplicate workflow/i })).not.toBeInTheDocument()
    expect(within(valuesResultView).queryByLabelText(/duplicate analysis workflow/i)).not.toBeInTheDocument()
    await waitFor(() => {
      expect(discoverValuesFieldsMock).toHaveBeenCalledTimes(1)
    })
    expect(analyzeAdvancedFieldDuplicatesMock).not.toHaveBeenCalled()
    expect(analyzeCompositeDuplicatesMock).not.toHaveBeenCalled()
  })

  it('renders Values disabled state without invoking Values commands when the Values feature is disabled', async () => {
    getConfigMock.mockResolvedValue({
      config: {
        ...appConfig.config,
        features: {
          ...appConfig.config.features,
          values_explorer: false,
        },
      },
    })

    renderApp()
    fireEvent.click(screen.getByRole('button', { name: /analyze json/i }))

    expect(await screen.findByLabelText(/statistics result view/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: /^values$/i }))

    const valuesResultView = await screen.findByLabelText(/values result view/i)
    const valuesView = await within(valuesResultView).findByLabelText(/values explorer view/i)
    expect(await within(valuesView).findByText(/values explorer disabled/i)).toBeInTheDocument()
    expect(valuesView).toHaveTextContent(/disabled by configuration/i)
    expect(within(valuesView).queryByRole('button', { name: /select fields/i })).not.toBeInTheDocument()
    await waitFor(() => {
      expect(getConfigMock).toHaveBeenCalled()
    })
    expect(discoverValuesFieldsMock).not.toHaveBeenCalled()
    expect(analyzeValuesMock).not.toHaveBeenCalled()
  })

  it('caps Values Explorer field multi-select at five fields', async () => {
    renderApp()
    fireEvent.click(screen.getByRole('button', { name: /analyze json/i }))

    expect(await screen.findByLabelText(/statistics result view/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: /^values$/i }))

    const valuesView = await screen.findByLabelText(/values explorer view/i)
    expect(await within(valuesView).findByText('Engineering')).toBeInTheDocument()
    fireEvent.click(within(valuesView).getByRole('button', { name: /select fields/i }))
    expect(within(valuesView).getByRole('option', { name: /department/i })).toHaveAttribute('aria-selected', 'true')

    fireEvent.click(within(valuesView).getByRole('option', { name: /role/i }))
    fireEvent.click(within(valuesView).getByRole('option', { name: /location/i }))
    fireEvent.click(within(valuesView).getByRole('option', { name: /status/i }))
    fireEvent.click(within(valuesView).getByRole('option', { name: /name/i }))

    await waitFor(() => {
      expect(analyzeValuesMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          selected_fields: ['[].department', '[].role', '[].location', '[].status', '[].name'],
        }),
      )
    })
    const analyzeCallCount = analyzeValuesMock.mock.calls.length
    const idOption = within(valuesView).getByRole('option', { name: /id/i })
    expect(idOption).toHaveAttribute('aria-disabled', 'true')
    expect(within(valuesView).getByRole('status')).toHaveTextContent(/5 of 5 selected\. limit reached/i)

    fireEvent.click(idOption)
    expect(analyzeValuesMock).toHaveBeenCalledTimes(analyzeCallCount)
    expect(within(valuesView).getAllByText(/5 selected/i).length).toBeGreaterThan(0)
  })
})
