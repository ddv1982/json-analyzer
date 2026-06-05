import { useEffect, useRef, useState } from 'react'

export interface ClipboardWriteResult {
  ok: boolean
  error?: string
}

export async function writeClipboardText(text: string): Promise<ClipboardWriteResult> {
  if (typeof navigator === 'undefined' || typeof navigator.clipboard?.writeText !== 'function') {
    return { ok: false, error: 'Clipboard copy is unavailable in this browser context.' }
  }

  try {
    await navigator.clipboard.writeText(text)
    return { ok: true }
  } catch {
    return { ok: false, error: 'Clipboard copy failed. Check browser permissions and try again.' }
  }
}

export function useClipboardCopy(timeoutMs = 1800) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [errorKey, setErrorKey] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current)
      }
    }
  }, [])

  async function copy(text: string, key: string): Promise<ClipboardWriteResult> {
    const result = await writeClipboardText(text)

    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
    }

    if (result.ok) {
      setCopiedKey(key)
      setErrorKey(null)
      setErrorMessage(null)
    } else {
      setCopiedKey(null)
      setErrorKey(key)
      setErrorMessage(result.error ?? 'Clipboard copy failed.')
    }

    timerRef.current = window.setTimeout(() => {
      setCopiedKey(null)
      setErrorKey(null)
      setErrorMessage(null)
      timerRef.current = null
    }, timeoutMs)

    return result
  }

  return { copiedKey, errorKey, errorMessage, copy }
}
