import uiPreset from "@repo/ui/tailwind-preset"
import type { Config } from "tailwindcss"

export default {
  presets: [uiPreset],
  content: [
    "./index.html",
    "./src/app/**/*.{ts,tsx}",
    "../../packages/ui/src/**/*.tsx",
  ],
} satisfies Config
