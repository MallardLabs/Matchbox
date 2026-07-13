import { useSyncExternalStore } from "react"

let isShiftKeyHeld = false
const subscribers = new Set<() => void>()

function updateShiftKeyState(nextState: boolean) {
  if (isShiftKeyHeld === nextState) return
  isShiftKeyHeld = nextState
  for (const subscriber of subscribers) subscriber()
}

function handleKeyDown(event: KeyboardEvent) {
  if (event.key === "Shift") updateShiftKeyState(true)
}

function handleKeyUp(event: KeyboardEvent) {
  if (event.key === "Shift") updateShiftKeyState(false)
}

function handleWindowBlur() {
  updateShiftKeyState(false)
}

function subscribe(subscriber: () => void) {
  if (subscribers.size === 0) {
    window.addEventListener("keydown", handleKeyDown)
    window.addEventListener("keyup", handleKeyUp)
    window.addEventListener("blur", handleWindowBlur)
  }

  subscribers.add(subscriber)
  return () => {
    subscribers.delete(subscriber)
    if (subscribers.size === 0) {
      window.removeEventListener("keydown", handleKeyDown)
      window.removeEventListener("keyup", handleKeyUp)
      window.removeEventListener("blur", handleWindowBlur)
    }
  }
}

export default function useShiftKeyHeld() {
  return useSyncExternalStore(
    subscribe,
    () => isShiftKeyHeld,
    () => false,
  )
}
