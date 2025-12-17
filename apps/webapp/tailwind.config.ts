import type { Config } from "tailwindcss"

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Brand colors
        brand: {
          DEFAULT: "#F7931A",
          hover: "#E8850F",
          subtle: "rgba(247, 147, 26, 0.12)",
          "subtle-hover": "rgba(247, 147, 26, 0.18)",
        },
        // Terminal-inspired surfaces
        surface: {
          DEFAULT: "var(--surface)",
          secondary: "var(--surface-secondary)",
          elevated: "var(--surface-elevated)",
          inset: "var(--surface-inset)",
        },
        // Content/text colors
        content: {
          primary: "var(--content-primary)",
          secondary: "var(--content-secondary)",
          tertiary: "var(--content-tertiary)",
          muted: "var(--content-muted)",
        },
        // Border colors
        border: {
          DEFAULT: "var(--border)",
          focus: "var(--border-focus)",
          subtle: "var(--border-subtle)",
        },
        // Semantic colors
        positive: {
          DEFAULT: "var(--positive)",
          subtle: "var(--positive-subtle)",
        },
        negative: {
          DEFAULT: "var(--negative)",
          subtle: "var(--negative-subtle)",
        },
        warning: {
          DEFAULT: "var(--warning)",
          subtle: "var(--warning-subtle)",
        },
        // Terminal accent colors
        terminal: {
          green: "#22C55E",
          amber: "#F59E0B",
          cyan: "#06B6D4",
          red: "#EF4444",
          purple: "#A855F7",
        },
      },
      fontFamily: {
        mono: [
          "IBM Plex Mono",
          "JetBrains Mono",
          "Fira Code",
          "Consolas",
          "Monaco",
          "monospace",
        ],
      },
      fontSize: {
        // Terminal-optimized type scale (bumped up for readability)
        "2xs": ["0.75rem", { lineHeight: "1.125rem" }], // 12px
        xs: ["0.8125rem", { lineHeight: "1.25rem" }], // 13px
        sm: ["0.875rem", { lineHeight: "1.375rem" }], // 14px
        base: ["1rem", { lineHeight: "1.5rem" }], // 16px
        lg: ["1.125rem", { lineHeight: "1.625rem" }], // 18px
        xl: ["1.25rem", { lineHeight: "1.75rem" }], // 20px
        "2xl": ["1.5rem", { lineHeight: "2rem" }], // 24px
        "3xl": ["1.875rem", { lineHeight: "2.25rem" }], // 30px
        "4xl": ["2.25rem", { lineHeight: "2.75rem" }], // 36px
        "5xl": ["3rem", { lineHeight: "3.5rem" }], // 48px
      },
      borderRadius: {
        sm: "4px",
        DEFAULT: "6px",
        md: "8px",
        lg: "10px",
        xl: "12px",
        "2xl": "16px",
      },
      spacing: {
        "4.5": "1.125rem", // 18px
        "5.5": "1.375rem", // 22px
        "13": "3.25rem", // 52px
        "15": "3.75rem", // 60px
        "18": "4.5rem", // 72px
      },
      boxShadow: {
        "terminal-sm": "0 1px 2px rgba(0, 0, 0, 0.05)",
        terminal:
          "0 1px 3px rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)",
        "terminal-md":
          "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)",
        "terminal-lg":
          "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)",
        glow: "0 0 20px rgba(247, 147, 26, 0.3)",
        "glow-sm": "0 0 10px rgba(247, 147, 26, 0.2)",
        "glow-positive": "0 0 10px rgba(34, 197, 94, 0.3)",
      },
      animation: {
        "spring-in": "springIn 0.45s cubic-bezier(0.16, 1, 0.3, 1) forwards",
        "spring-in-card":
          "springInCard 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards",
        "fade-in": "fadeIn 0.3s ease-out forwards",
        "slide-up": "slideUp 0.3s ease-out forwards",
        pulse: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "cursor-blink": "cursorBlink 1s step-end infinite",
      },
      keyframes: {
        springIn: {
          "0%": { opacity: "0", transform: "scale(1.35)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        springInCard: {
          "0%": { opacity: "0", transform: "scale(1.4)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        cursorBlink: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0" },
        },
      },
      backdropBlur: {
        xs: "2px",
      },
      transitionTimingFunction: {
        spring: "cubic-bezier(0.16, 1, 0.3, 1)",
      },
    },
  },
  plugins: [],
}

export default config
