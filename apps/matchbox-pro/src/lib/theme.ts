export type ThemeMode = "light" | "dark"

const STORAGE_KEY = "matchbox-pro:theme"

export function readStoredTheme(): ThemeMode {
  if (typeof window === "undefined") return "light"
  const stored = window.localStorage.getItem(STORAGE_KEY)
  return stored === "dark" ? "dark" : "light"
}

export function applyTheme(mode: ThemeMode) {
  const root = document.documentElement
  root.classList.toggle("dark", mode === "dark")
  window.localStorage.setItem(STORAGE_KEY, mode)
}

export function toggleTheme(mode: ThemeMode): ThemeMode {
  return mode === "light" ? "dark" : "light"
}
