import {
  type ReactElement,
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react"
import { THEME_STORAGE_KEY } from "./theme-script"

export type ThemePreference = "system" | "light" | "dark"
export type ResolvedTheme = "light" | "dark"

type ThemeContextValue = {
  preference: ThemePreference
  resolved: ResolvedTheme
  setPreference: (preference: ThemePreference) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

const DARK_QUERY = "(prefers-color-scheme: dark)"

export function readStoredPreference(
  storageKey: string = THEME_STORAGE_KEY,
): ThemePreference {
  try {
    const stored = window.localStorage.getItem(storageKey)
    return stored === "light" || stored === "dark" ? stored : "system"
  } catch {
    return "system"
  }
}

function writeStoredPreference(
  storageKey: string,
  preference: ThemePreference,
): void {
  try {
    if (preference === "system") window.localStorage.removeItem(storageKey)
    else window.localStorage.setItem(storageKey, preference)
  } catch {
    // Storage can be unavailable (private mode, blocked site data).
  }
}

function subscribeSystem(onChange: () => void): () => void {
  if (typeof window.matchMedia !== "function") return () => {}
  const media = window.matchMedia(DARK_QUERY)
  media.addEventListener("change", onChange)
  return () => media.removeEventListener("change", onChange)
}

function systemIsDark(): boolean {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia(DARK_QUERY).matches
  )
}

export function applyResolvedTheme(resolved: ResolvedTheme): void {
  const root = document.documentElement
  root.classList.toggle("dark", resolved === "dark")
  root.style.colorScheme = resolved
}

type ThemeProviderProps = {
  children: ReactNode
  storageKey?: string
}

export function ThemeProvider({
  children,
  storageKey = THEME_STORAGE_KEY,
}: ThemeProviderProps): ReactElement {
  const [preference, setPreferenceState] = useState<ThemePreference>(() =>
    readStoredPreference(storageKey),
  )
  const systemDark = useSyncExternalStore(
    subscribeSystem,
    systemIsDark,
    () => false,
  )
  const resolved: ResolvedTheme =
    preference === "system" ? (systemDark ? "dark" : "light") : preference

  useEffect(() => {
    applyResolvedTheme(resolved)
  }, [resolved])

  const setPreference = useCallback(
    (next: ThemePreference) => {
      writeStoredPreference(storageKey, next)
      setPreferenceState(next)
    },
    [storageKey],
  )

  const value = useMemo(
    () => ({ preference, resolved, setPreference }),
    [preference, resolved, setPreference],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext)
  if (!value) throw new Error("useTheme must be used inside <ThemeProvider>")
  return value
}
