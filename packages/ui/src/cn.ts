import { type ClassValue, clsx } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"
import { createTV } from "tailwind-variants"

// The preset adds numeric weights, named shadows and a named type scale;
// without this tailwind-merge reads `font-600` as a font family and
// `text-label` as a color, and drops the class it thinks they conflict with.
const classGroups = {
  "font-weight": [{ font: ["400", "500", "550", "600", "650", "700"] }],
  "font-size": [
    {
      text: [
        "micro",
        "caption",
        "label",
        "body-sm",
        "body",
        "nav",
        "lead",
        "title-sm",
        "metric",
        "title",
        "hero",
      ],
    },
  ],
  shadow: [{ shadow: ["sheet", "pop", "knob", "dialog", "toast"] }],
}

const twMerge = extendTailwindMerge({ extend: { classGroups } })

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

export const tv = createTV({ twMergeConfig: { extend: { classGroups } } })
