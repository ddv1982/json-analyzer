import { useMutation } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  analyzeJson,
  formatJson,
  normalizeCommandError,
  validateJson,
  type AnalysisResponse,
  type ProblemDetails,
  type ValidateResponse,
} from '../../lib/commands'
import { sampleJsonInput } from '../../lib/sample-data'
import { useAppUiStore } from '../../state/useAppUiStore'

export type { ResultTab } from '../../state/useAppUiStore'

const DEBOUNCED_VALIDATION_MS = 500

export type BusyAction = 'validate' | 'format' | 'analyze' | null

export function useJsonAnalyzerState() {
  const [jsonInput, setJsonInput] = useState(sampleJsonInput)
  const [validation, setValidation] = useState<ValidateResponse | null>(null)
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null)
  const [inputError, setInputError] = useState<ProblemDetails | null>(null)
  const [analysisError, setAnalysisError] = useState<ProblemDetails | null>(null)
  const [busyAction, setBusyAction] = useState<BusyAction>(null)
  const activeTab = useAppUiStore((state) => state.activeResultsTab)
  const setActiveTab = useAppUiStore((state) => state.setActiveResultsTab)
  const resetResultsNavigation = useAppUiStore((state) => state.resetResultsNavigation)
  const [isDebouncedValidating, setIsDebouncedValidating] = useState(false)
  const [flattenNestedArrays, setFlattenNestedArrays] = useState(false)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const validationRequestIdRef = useRef(0)
  const validateMutation = useMutation({ mutationFn: (request: Parameters<typeof validateJson>[0]) => validateJson(request) })
  const formatMutation = useMutation({ mutationFn: (request: Parameters<typeof formatJson>[0]) => formatJson(request) })
  const analyzeMutation = useMutation({ mutationFn: (request: Parameters<typeof analyzeJson>[0]) => analyzeJson(request) })

  const inputByteCount = useMemo(() => new Blob([jsonInput]).size, [jsonInput])
  const hasInput = jsonInput.length > 0
  const isBusy = busyAction !== null
  const isBrowserMockMode =
    import.meta.env.DEV && typeof window !== 'undefined' && !('__TAURI_INTERNALS__' in window)

  useEffect(() => {
    return () => {
      clearDebouncedValidation()
      validationRequestIdRef.current += 1
    }
  }, [])

  function clearDebouncedValidation() {
    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current)
      debounceTimerRef.current = null
    }
  }

  function scheduleDebouncedValidation(nextJsonInput: string) {
    clearDebouncedValidation()
    const requestId = validationRequestIdRef.current + 1
    validationRequestIdRef.current = requestId

    if (nextJsonInput.length === 0) {
      setIsDebouncedValidating(false)
      return
    }

    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null
      void runDebouncedValidation(nextJsonInput, requestId)
    }, DEBOUNCED_VALIDATION_MS)
  }

  async function runDebouncedValidation(jsonString: string, requestId: number) {
    setIsDebouncedValidating(true)

    try {
      const result = await validateMutation.mutateAsync({ json_string: jsonString })
      if (validationRequestIdRef.current === requestId) {
        setValidation(result)
        setInputError(null)
      }
    } catch (unknownError) {
      if (validationRequestIdRef.current === requestId) {
        setValidation(null)
        setInputError(normalizeCommandError(unknownError))
      }
    } finally {
      if (validationRequestIdRef.current === requestId) {
        setIsDebouncedValidating(false)
      }
    }
  }

  function invalidateDebouncedValidation() {
    clearDebouncedValidation()
    validationRequestIdRef.current += 1
    setIsDebouncedValidating(false)
  }

  function handleJsonInputChange(nextJsonInput: string) {
    setJsonInput(nextJsonInput)
    setValidation(null)
    setAnalysis(null)
    setInputError(null)
    setAnalysisError(null)
    scheduleDebouncedValidation(nextJsonInput)
  }

  function handleLoadExample() {
    handleJsonInputChange(sampleJsonInput)
  }

  async function handleFormat() {
    invalidateDebouncedValidation()
    setBusyAction('format')
    setInputError(null)

    try {
      const result = await formatMutation.mutateAsync({ json_string: jsonInput })
      setJsonInput(result.formatted_json)
      setValidation(null)
      setAnalysis(null)
      setAnalysisError(null)
    } catch (unknownError) {
      setInputError(normalizeCommandError(unknownError))
    } finally {
      setBusyAction(null)
    }
  }

  function handleClear() {
    invalidateDebouncedValidation()
    setJsonInput('')
    setValidation(null)
    setAnalysis(null)
    setInputError(null)
    setAnalysisError(null)
  }

  function handleFlattenNestedArraysChange(nextFlattenNestedArrays: boolean) {
    setFlattenNestedArrays(nextFlattenNestedArrays)
    setAnalysis(null)
    setAnalysisError(null)
  }

  async function handleAnalyze() {
    invalidateDebouncedValidation()
    setBusyAction('analyze')
    setInputError(null)
    setAnalysisError(null)
    setValidation(null)
    setAnalysis(null)

    let validationResult: ValidateResponse
    try {
      validationResult = await validateMutation.mutateAsync({ json_string: jsonInput })
      setValidation(validationResult)
    } catch (unknownError) {
      const normalizedError = normalizeCommandError(unknownError)
      setValidation(null)
      setInputError(normalizedError)
      setAnalysisError(normalizedError)
      setBusyAction(null)
      return
    }

    try {
      const analysisResult = await analyzeMutation.mutateAsync({
        json_string: jsonInput,
        min_max_deep: true,
        flatten: flattenNestedArrays,
      })
      setAnalysis(analysisResult)
      resetResultsNavigation()
    } catch (unknownError) {
      setAnalysis(null)
      setAnalysisError(normalizeCommandError(unknownError))
    } finally {
      setBusyAction(null)
    }
  }

  function handleClearResults() {
    setAnalysis(null)
    setAnalysisError(null)
    resetResultsNavigation()
  }

  return {
    activeTab,
    analysis,
    analysisError,
    busyAction,
    inputError,
    flattenNestedArrays,
    handleAnalyze,
    handleClear,
    handleClearResults,
    handleFlattenNestedArraysChange,
    handleFormat,
    handleJsonInputChange,
    handleLoadExample,
    hasInput,
    inputByteCount,
    isBrowserMockMode,
    isBusy,
    isDebouncedValidating,
    jsonInput,
    setActiveTab,
    validation,
  }
}

export const useJsonAnalyzerController = useJsonAnalyzerState
