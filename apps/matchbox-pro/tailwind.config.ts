import type { Config } from "tailwindcss"

const tokens = [
  "canvas",
  "surface",
  "raised",
  "inset",
  "inset-2",
  "ink",
  "ink-2",
  "secondary",
  "muted",
  "faint",
  "line",
  "line-2",
  "accent",
  "accent-ink",
  "accent-soft",
  "accent-soft-2",
  "accent-line",
  "on-accent",
  "mezo",
  "mezo-brand",
  "expired",
  "pos",
  "warn",
  "neg",
] as const

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: Object.fromEntries(
        tokens.map((token) => [
          token,
          `color-mix(in srgb, var(--${token}) calc(<alpha-value> * 100%), transparent)`,
        ]),
      ),
      fontFamily: {
        sans: ["Figtree Variable", "Figtree", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["DM Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      fontWeight: {
        400: "400",
        500: "500",
        550: "550",
        600: "600",
        650: "650",
        700: "700",
      },
      boxShadow: {
        sheet: "0 -12px 40px rgb(0 0 0 / 0.10)",
        pop: "0 8px 24px rgb(0 0 0 / 0.08)",
        knob: "0 1px 2px rgb(0 0 0 / 0.08)",
      },
    },
  },
  plugins: [],
} satisfies Config
