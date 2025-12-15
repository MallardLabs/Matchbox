import { useEffect, useState } from "react"

const THEME_STORAGE_KEY = "matchbox-theme"

function getInitialTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light"
  const stored = localStorage.getItem(THEME_STORAGE_KEY)
  if (stored === "light" || stored === "dark") return stored
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

export function PageLoader() {
  const [theme, setTheme] = useState<"light" | "dark">("light")

  useEffect(() => {
    const initialTheme = getInitialTheme()
    setTheme(initialTheme)
    // Also set html class for body background
    document.documentElement.classList.toggle("dark-mode", initialTheme === "dark")
  }, [])

  const isDark = theme === "dark"

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        height: "100vh",
        backgroundColor: isDark ? "#161616" : "#ffffff",
        transition: "background-color 0.2s ease",
      }}
    >
      <div
        style={{
          width: "40px",
          height: "40px",
          border: `3px solid ${isDark ? "#292929" : "#e8e8e8"}`,
          borderTopColor: isDark ? "#ffffff" : "#000000",
          borderRadius: "50%",
          animation: "spin 1s linear infinite",
        }}
      />
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
