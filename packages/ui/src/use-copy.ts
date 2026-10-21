import { useCallback, useEffect, useRef, useState } from "react"

export type CopyState = "idle" | "copied" | "failed"

const RESET_MS = 1600

async function writeClipboard(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value)
    return
  }
  const area = document.createElement("textarea")
  area.value = value
  area.setAttribute("readonly", "")
  area.style.position = "fixed"
  area.style.opacity = "0"
  document.body.append(area)
  area.select()
  const ok = document.execCommand("copy")
  area.remove()
  if (!ok) throw new Error("Clipboard unavailable")
}

export function useCopy(value: string): {
  state: CopyState
  copy: () => Promise<void>
} {
  const [state, setState] = useState<CopyState>("idle")
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const copy = useCallback(async () => {
    window.clearTimeout(timer.current)
    try {
      await writeClipboard(value)
      setState("copied")
    } catch {
      setState("failed")
    }
    timer.current = window.setTimeout(() => setState("idle"), RESET_MS)
  }, [value])

  return { state, copy }
}
