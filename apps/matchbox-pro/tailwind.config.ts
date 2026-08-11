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
        canvas: "var(--canvas)",
        panel: "var(--panel)",
        raised: "var(--raised)",
        subtle: "var(--subtle)",
        ink: "var(--ink)",
        secondary: "var(--secondary)",
        muted: "var(--muted)",
        line: "var(--line)",
        accent: {
          DEFAULT: "#f7931a",
          strong: "#e9800e",
          soft: "var(--accent-soft)",
        },
        positive: "var(--positive)",
        "positive-soft": "var(--positive-soft)",
        warning: "var(--warning)",
        "warning-soft": "var(--warning-soft)",
        negative: "var(--negative)",
        "negative-soft": "var(--negative-soft)",
      },
      fontFamily: {
        sans: ["IBM Plex Sans", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["IBM Plex Mono", "SFMono-Regular", "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
}

export default config
