import type { Config } from "tailwindcss"

export const tokenNames = [
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
  "info",
  "pos-soft",
  "warn-soft",
  "neg-soft",
  "vebtc",
  "vemezo",
  "on-card",
  "scrim",
  "glow",
] as const

// One type scale for every Matchbox surface, read off the Pencil screens.
const fontSize = {
  micro: ["10px", { lineHeight: "14px" }],
  caption: ["11px", { lineHeight: "15px" }],
  label: ["12px", { lineHeight: "16px" }],
  "body-sm": ["13px", { lineHeight: "18px" }],
  body: ["14px", { lineHeight: "20px" }],
  nav: ["15px", { lineHeight: "20px" }],
  lead: ["16px", { lineHeight: "22px" }],
  "title-sm": ["18px", { lineHeight: "24px" }],
  metric: ["22px", { lineHeight: "28px" }],
  title: ["28px", { lineHeight: "34px" }],
  hero: ["40px", { lineHeight: "48px" }],
} satisfies Record<string, [string, { lineHeight: string }]>

// Fixed stacking order from the Pro foundations board.
const zIndex = {
  sticky: "10",
  rail: "20",
  sheet: "30",
  overlay: "40",
  toast: "50",
}

const colors = Object.fromEntries(
  tokenNames.map((token) => [
    token,
    `color-mix(in srgb, var(--${token}) calc(<alpha-value> * 100%), transparent)`,
  ]),
)

const preset = {
  content: [],
  darkMode: ["variant", "&:is(.dark *):not(.light *)"],
  theme: {
    extend: {
      colors,
      fontSize,
      zIndex,
      maxWidth: { content: "1152px" },
      borderColor: { DEFAULT: "var(--line)" },
      fontFamily: {
        sans: [
          "Figtree Variable",
          "Figtree",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
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
        dialog: "0 16px 40px rgb(0 0 0 / 0.16)",
        toast: "0 8px 24px rgb(0 0 0 / 0.25)",
      },
      keyframes: {
        "fade-in": { from: { opacity: "0" } },
        "sheet-in": {
          from: { transform: "translateY(24px)", opacity: "0" },
        },
        "pop-in": {
          from: { transform: "translateY(4px) scale(0.98)", opacity: "0" },
        },
        "drawer-in": {
          from: { transform: "translateX(24px)", opacity: "0" },
        },
      },
      animation: {
        "fade-in": "fade-in 160ms ease-out",
        "sheet-in": "sheet-in 200ms cubic-bezier(0.2, 0.8, 0.2, 1)",
        "pop-in": "pop-in 160ms cubic-bezier(0.2, 0.8, 0.2, 1)",
        "drawer-in": "drawer-in 220ms cubic-bezier(0.2, 0.8, 0.2, 1)",
      },
    },
  },
  plugins: [],
} satisfies Config

export default preset
