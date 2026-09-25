import { cn } from "@/lib/cn"
import type { ReactElement } from "react"

const BTC_PATH =
  "M46.103 27.444c0.637-4.258-2.605-6.547-7.038-8.074l1.438-5.768-3.511-0.875-1.4 5.616c-0.923-0.23-1.871-0.447-2.813-0.662l1.41-5.653-3.509-0.875-1.439 5.766c-0.764-0.174-1.514-0.346-2.242-0.527l0.004-0.018-4.842-1.209-0.934 3.75s2.605 0.597 2.55 0.634c1.422 0.355 1.679 1.296 1.636 2.042l-1.638 6.571c0.098 0.025 0.225 0.061 0.365 0.117-0.117-0.029-0.242-0.061-0.371-0.092l-2.296 9.205c-0.174 0.432-0.615 1.08-1.609 0.834 0.035 0.051-2.552-0.637-2.552-0.637l-1.743 4.019 4.569 1.139c0.85 0.213 1.683 0.436 2.503 0.646l-1.453 5.834 3.507 0.875 1.439-5.772c0.958 0.26 1.888 0.5 2.798 0.726l-1.434 5.745 3.511 0.875 1.453-5.823c5.987 1.133 10.489 0.676 12.384-4.739 1.527-4.36-0.076-6.875-3.226-8.515 2.294-0.529 4.022-2.038 4.483-5.155z m-8.022 11.249c-1.085 4.36-8.426 2.003-10.806 1.412l1.928-7.729c2.38 0.594 10.012 1.77 8.878 6.317z m1.086-11.312c-0.99 3.966-7.1 1.951-9.082 1.457l1.748-7.01c1.982 0.494 8.365 1.416 7.334 5.553z"

const MEZO_PATH =
  "M590.319 1282.74l186.293-188.82v-0.84l185.406 188.83c53.582 54.3 119.112 78.46 183.752 78.46 135.25 0 265.36-106.88 265.36-267.29l185.41 188.83c53.58 54.3 119.11 78.46 183.75 78.46 135.25 0 265.36-106.88 265.36-267.29h-159.09l-185.4-187.917c-53.58-54.309-119.94-78.466-184.58-78.466-135.25 0-264.54 106.04-264.54 266.383l-185.4-187.917c-53.58-54.309-119.939-78.466-184.58-78.466-135.255 0-264.536 106.04-264.536 266.383l-476.319 0.84c0 161.25 131.825 265.55 267.079 265.55 64.641 0 130.169-24.16 182.035-76.73z"

export type TokenKind = "btc" | "mezo"

type TokenMarkProps = {
  kind: TokenKind
  size?: number
  /** "brand" = white glyph on brand disc; "inverse" = brand glyph on white disc (for use on colored cards). */
  tone?: "brand" | "inverse"
  className?: string
}

export default function TokenMark({
  kind,
  size = 16,
  tone = "brand",
  className,
}: TokenMarkProps): ReactElement {
  const inverse = tone === "inverse"
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full",
        inverse ? "bg-white" : kind === "btc" ? "bg-accent" : "bg-mezo-brand",
        className,
      )}
      style={{ width: size, height: size }}
    >
      {kind === "btc" ? (
        <svg
          aria-hidden="true"
          viewBox="8 6 48 52"
          width={size * 0.8}
          height={size * 0.8}
          className={inverse ? "fill-accent" : "fill-white"}
        >
          <path d={BTC_PATH} />
        </svg>
      ) : (
        <svg
          aria-hidden="true"
          viewBox="141 826 1905 535"
          width={size * 0.72}
          height={size * 0.5}
          className={inverse ? "fill-mezo-brand" : "fill-white"}
        >
          <path d={MEZO_PATH} />
        </svg>
      )}
    </span>
  )
}
