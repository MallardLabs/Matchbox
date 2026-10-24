import uiPreset from "@repo/ui/tailwind-preset"
import type { Config } from "tailwindcss"

export default {
  presets: [uiPreset],
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx}",
    "!./src/worker/**",
    "../../packages/ui/src/**/*.tsx",
  ],
} satisfies Config
