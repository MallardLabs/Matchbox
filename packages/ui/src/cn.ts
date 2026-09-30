import { type ClassValue, clsx } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"
import { createTV } from "tailwind-variants"

// The preset adds numeric weights and named shadows; without this tailwind-merge
// reads `font-600` as a font family and drops `font-mono` next to it.
const classGroups = {
  "font-weight": [{ font: ["400", "500", "550", "600", "650", "700"] }],
  shadow: [{ shadow: ["sheet", "pop", "knob", "dialog", "toast"] }],
}

const twMerge = extendTailwindMerge({ extend: { classGroups } })

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

export const tv = createTV({ twMergeConfig: { extend: { classGroups } } })
