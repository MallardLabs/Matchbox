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

export function InitialLoader(): JSX.Element {
  const [isDark, setIsDark] = useState(false)

  useEffect(() => {
    setIsDark(getInitialTheme() === "dark")
  }, [])

  const colors = {
    background: isDark ? "#0c0c0c" : "#fafaf9",
    surface: isDark ? "#161616" : "#ffffff",
    border: isDark ? "#2a2a2a" : "#e7e5e4",
    accent: "#F7931A",
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: colors.background,
        fontFamily: '"IBM Plex Mono", monospace',
      }}
    >
      {/* Header placeholder */}
      <header
        style={{
          height: "56px",
          borderBottom: `1px solid ${colors.border}`,
          backgroundColor: colors.surface,
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Animated scan line */}
        <div
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            width: "100px",
            background: `linear-gradient(90deg,
              transparent 0%,
              ${colors.accent}15 50%,
              transparent 100%)`,
            animation: "scanLine 1.2s ease-in-out infinite",
          }}
        />
      </header>

      {/* Content area with terminal-style loading */}
      <main
        style={{
          maxWidth: "1280px",
          margin: "0 auto",
          padding: "24px 16px",
        }}
      >
        {/* Loading indicator */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            color: isDark ? "#a8a29e" : "#57534e",
            fontSize: "14px",
          }}
        >
          <span style={{ color: colors.accent }}>$</span>
          <span>loading</span>
          <span
            style={{
              display: "inline-block",
              width: "8px",
              height: "16px",
              backgroundColor: colors.accent,
              animation: "blink 1s step-end infinite",
            }}
          />
        </div>
      </main>

      <style>{`
        @keyframes scanLine {
          0% {
            left: -100px;
            opacity: 0;
          }
          10% {
            opacity: 1;
          }
          90% {
            opacity: 1;
          }
          100% {
            left: 100%;
            opacity: 0;
          }
        }

        @keyframes blink {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0;
          }
        }
      `}</style>
    </div>
  )
}
