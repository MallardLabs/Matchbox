import { usePreviewMode } from "@/contexts/PreviewModeContext"
import { useEffect } from "react"

function isTextInputFocused(): boolean {
  const el = document.activeElement as HTMLElement | null
  if (!el) return false
  const tag = el.tagName
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true
  if (el.isContentEditable) return true
  return false
}

/**
 * Binds Shift+P to toggle preview mode. Ignored while the user is typing in
 * an input / textarea / contenteditable.
 */
export function usePreviewModeHotkey() {
  const { toggle } = usePreviewMode()

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "P") return
      if (!e.shiftKey) return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (isTextInputFocused()) return
      e.preventDefault()
      toggle()
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [toggle])
}
