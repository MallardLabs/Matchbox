import { useEffect, useState } from "react"

const THEME_STORAGE_KEY = "matchbox-theme"

function getInitialTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light"
  const stored = localStorage.getItem(THEME_STORAGE_KEY)
  if (stored === "light" || stored === "dark") return stored
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light"
}

export function InitialLoader() {
  const [isDark, setIsDark] = useState(false)

  useEffect(() => {
    setIsDark(getInitialTheme() === "dark")
  }, [])

  const colors = {
    backgroundPrimary: isDark ? "#161616" : "#ffffff",
    borderOpaque: isDark ? "#292929" : "#e8e8e8",
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: colors.backgroundPrimary,
      }}
    >
      {/* Header placeholder with glow effect */}
      <div
        style={{
          height: "72px",
          borderBottom: `1px solid ${colors.borderOpaque}`,
          backgroundColor: colors.backgroundPrimary,
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Wide sweeping glow */}
        <div
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            width: "80%",
            background: isDark
              ? `linear-gradient(90deg, 
                  transparent 0%, 
                  rgba(255,255,255,0.02) 10%,
                  rgba(255,255,255,0.06) 30%,
                  rgba(255,255,255,0.1) 50%,
                  rgba(255,255,255,0.06) 70%,
                  rgba(255,255,255,0.02) 90%,
                  transparent 100%)`
              : `linear-gradient(90deg, 
                  transparent 0%, 
                  rgba(0,0,0,0.01) 10%,
                  rgba(0,0,0,0.03) 30%,
                  rgba(0,0,0,0.05) 50%,
                  rgba(0,0,0,0.03) 70%,
                  rgba(0,0,0,0.01) 90%,
                  transparent 100%)`,
            animation: "xpGlow 0.8s linear infinite",
          }}
        />
      </div>

      <style>{`
        @keyframes xpGlow {
          0% {
            left: -80%;
          }
          100% {
            left: 100%;
          }
        }
      `}</style>
    </div>
  )
}
