export interface ProblemDetails {
  error_type: string
  title: string
  status?: number | null
  detail: string
  instance?: string | null
  invalid_params?: InvalidParam[]
  position?: ErrorPosition | null
}

export interface InvalidParam {
  name: string
  reason: string
}

export interface ErrorPosition {
  offset: number
  line: number
  column: number
}

export function isProblemDetails(error: unknown): error is ProblemDetails {
  if (typeof error !== 'object' || error === null) {
    return false
  }

  const candidate = error as Record<string, unknown>
  return (
    typeof candidate.error_type === 'string' &&
    typeof candidate.title === 'string' &&
    typeof candidate.detail === 'string'
  )
}

export function normalizeCommandError(error: unknown): ProblemDetails {
  if (isProblemDetails(error)) {
    return error
  }

  if (error instanceof Error) {
    return {
      error_type: 'tauri_invoke_error',
      title: error.name || 'Tauri invoke error',
      status: null,
      detail: error.message,
      instance: null,
    }
  }

  if (typeof error === 'string') {
    return {
      error_type: 'tauri_invoke_error',
      title: 'Tauri invoke error',
      status: null,
      detail: error,
      instance: null,
    }
  }

  return {
    error_type: 'tauri_invoke_error',
    title: 'Tauri invoke error',
    status: null,
    detail: stringifyUnknownError(error),
    instance: null,
  }
}

function stringifyUnknownError(error: unknown): string {
  try {
    const json = JSON.stringify(error)
    if (json) {
      return json
    }
  } catch {
    // Fall back to String below; JSON.stringify can throw for circular values or custom toJSON implementations.
  }

  try {
    return String(error)
  } catch {
    return 'Unknown Tauri invoke error'
  }
}
