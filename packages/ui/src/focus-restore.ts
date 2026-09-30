import { useCallback, useRef } from "react"

type AutoFocusHandler = (event: Event) => void

/**
 * Radix dialogs return focus to their Trigger; when opened programmatically
 * there is none. This records the element focused at open and returns focus
 * to it on close.
 */
export function useFocusRestore(
  onOpenAutoFocus: AutoFocusHandler | undefined,
  onCloseAutoFocus: AutoFocusHandler | undefined,
): { onOpenAutoFocus: AutoFocusHandler; onCloseAutoFocus: AutoFocusHandler } {
  const previous = useRef<HTMLElement | null>(null)

  const handleOpen = useCallback(
    (event: Event) => {
      const active = document.activeElement
      previous.current =
        active instanceof HTMLElement && active !== document.body
          ? active
          : null
      onOpenAutoFocus?.(event)
    },
    [onOpenAutoFocus],
  )

  const handleClose = useCallback(
    (event: Event) => {
      onCloseAutoFocus?.(event)
      if (event.defaultPrevented) return
      const target = previous.current
      previous.current = null
      if (target?.isConnected) {
        event.preventDefault()
        target.focus({ preventScroll: true })
      }
    },
    [onCloseAutoFocus],
  )

  return { onOpenAutoFocus: handleOpen, onCloseAutoFocus: handleClose }
}
