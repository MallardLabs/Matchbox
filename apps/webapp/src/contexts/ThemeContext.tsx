import { ClayDarkTheme, ClayLightTheme } from "@mezo-org/mezo-clay"
import { createContext, useContext, useEffect, useState, type ReactNode } from "react"

type Theme = "light" | "dark"

type ThemeContextType = {
  theme: Theme
  toggleTheme: () => void
  setTheme: (theme: Theme) => void
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

const THEME_STORAGE_KEY = "matchbox-theme"

function getSystemTheme(): Theme {
  if (typeof window === "undefined") return "light"
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

function getStoredTheme(): Theme | null {
  if (typeof window === "undefined") return null
  const stored = localStorage.getItem(THEME_STORAGE_KEY)
  if (stored === "light" || stored === "dark") return stored
  return null
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    // On first render, check localStorage first, then fall back to system preference
    const stored = getStoredTheme()
    if (stored) return stored
    return getSystemTheme()
  })

  useEffect(() => {
    // On mount, apply the correct theme
    const stored = getStoredTheme()
    if (stored) {
      setThemeState(stored)
    } else {
      setThemeState(getSystemTheme())
    }
  }, [])

  // Listen for system preference changes (only if user hasn't manually set a preference)
  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")
    
    const handleChange = (e: MediaQueryListEvent) => {
      // Only follow system changes if user hasn't manually set a preference
      if (!getStoredTheme()) {
        setThemeState(e.matches ? "dark" : "light")
      }
    }

    mediaQuery.addEventListener("change", handleChange)
    return () => mediaQuery.removeEventListener("change", handleChange)
  }, [])

  // Sync dark-mode class on html element for CSS
  useEffect(() => {
    document.documentElement.classList.toggle("dark-mode", theme === "dark")
  }, [theme])

  // setTheme saves to localStorage (for manual user changes)
  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme)
    if (typeof window !== "undefined") {
      localStorage.setItem(THEME_STORAGE_KEY, newTheme)
    }
  }

  const toggleTheme = () => {
    setTheme(theme === "light" ? "dark" : "light")
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider")
  }
  return context
}

export function getThemeObject(theme: Theme) {
  return theme === "dark" ? ClayDarkTheme : ClayLightTheme
}

