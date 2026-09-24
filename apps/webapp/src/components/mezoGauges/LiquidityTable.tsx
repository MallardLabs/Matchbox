import { BASELINE, MEZO_GAUGES } from "@/lib/mezoGauges/constants"
import type { MezoGaugesLiquidityResponse } from "@/lib/mezoGauges/schema"
import { Card, Skeleton, Tag } from "@mezo-org/mezo-clay"

import { SectionError, formatCompactUsd, gaugeColor } from "./shared"

const TOKEN_DECIMALS: Record<string, number> = { USDC: 6, MUSD: 18, MEZO: 18 }

function tokenUnits(amount: string, token: string): bigint {
  const decimals = TOKEN_DECIMALS[token] ?? 18
  return BigInt(amount) * 10n ** BigInt(18 - decimals)
}

function formatTokenAmount(amount: string, token: string): string {
  const divisor = 10n ** BigInt(TOKEN_DECIMALS[token] ?? 18)
  const units = BigInt(amount)
  const whole = (units / divisor).toLocaleString("en-US")
  const fraction = (((units % divisor) * 100n) / divisor)
    .toString()
    .padStart(2, "0")
  return `${whole}.${fraction} ${token}`
}

const SOURCE_LABELS: Record<string, string> = {
  defillama: "DefiLlama",
  "curve-api": "Curve API",
  "onchain-composition": "on-chain",
}

// Keys are lowercase gauge addresses; lookups must lowercase too — the
// MEZO_GAUGES registry keys are EIP-55 checksummed.
const BASELINE_BY_GAUGE: Record<string, string> = {
  "0xc7e81dd77a4624f0dd14a8bb97bc721b0cee6e26":
    BASELINE.liquidityUsd.aerodromeUsdcMusd,
  "0x4440a9b2954cb98416c0122e2ea996c46555f4b6":
    BASELINE.liquidityUsd.aerodromeMezoMusd,
  "0x2ced96e759ab481210d41c567eee5c42edb59a1d": BASELINE.liquidityUsd.uniswapV4,
  "0xc39a294024dca62f579c49d7c83a6c831d4976d0": BASELINE.liquidityUsd.curve,
}

function usdDelta(
  current: string | null,
  baseline: string | undefined,
): string {
  if (current === null || baseline === undefined) return "—"
  const diff = Number(current) - Number(baseline)
  if (!Number.isFinite(diff)) return "—"
  const sign = diff > 0 ? "+" : diff < 0 ? "−" : ""
  return `${sign}${formatCompactUsd(String(Math.abs(diff)))}`
}

export function LiquidityTable({
  venues,
  isLoading,
  error,
}: {
  venues: MezoGaugesLiquidityResponse["venues"]
  isLoading: boolean
  error: Error | null
}): JSX.Element {
  return (
    <section aria-labelledby="mezo-gauges-liquidity">
      <Card title="Destination liquidity" withBorder overrides={{}}>
        <h2
          id="mezo-gauges-liquidity"
          className="py-2 text-sm font-medium text-[var(--content-secondary)]"
        >
          Liquidity on the pools these gauges fund
        </h2>
        {isLoading ? (
          <Skeleton width="100%" height="140px" animation />
        ) : error ? (
          <SectionError message="Unable to load liquidity data." />
        ) : (
          <div className="overflow-x-auto pb-4">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <caption className="sr-only">
                TVL, composition and volume for each gauge destination pool
              </caption>
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-2xs uppercase tracking-wider text-[var(--content-tertiary)]">
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Pool
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    TVL
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Composition
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    24h vol
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    7d vol
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Δ vs baseline
                  </th>
                  <th scope="col" className="py-2 font-medium">
                    Source
                  </th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(MEZO_GAUGES).map(([gauge, config]) => {
                  const venue = venues[gauge]
                  if (!venue || venue.status === "unavailable") {
                    return (
                      <tr
                        key={gauge}
                        className="border-b border-[var(--border)] last:border-0"
                      >
                        <th
                          scope="row"
                          className="py-2 pr-4 text-left font-normal"
                        >
                          <a
                            href={config.poolUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[var(--content-primary)] no-underline hover:text-[#F7931A] hover:underline"
                          >
                            {config.name}
                          </a>
                          <span className="ml-2 text-2xs text-[var(--content-tertiary)]">
                            {config.protocol} · {config.network}
                          </span>
                        </th>
                        <td
                          colSpan={6}
                          className="py-2 text-[var(--content-tertiary)]"
                        >
                          unavailable
                          {venue && venue.composition.length > 0 && (
                            <span className="ml-2 font-mono text-2xs">
                              {venue.composition
                                .map((c) => `${c.token} ${c.amount}`)
                                .join(" · ")}
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  }

                  const stablePair =
                    venue.composition.length === 2 &&
                    venue.composition.every(
                      (c) => c.token === "MUSD" || c.token === "USDC",
                    )
                  const totalUnits = stablePair
                    ? venue.composition.reduce(
                        (sum, c) => sum + tokenUnits(c.amount, c.token),
                        0n,
                      )
                    : 0n
                  const musd = venue.composition.find((c) => c.token === "MUSD")
                  const musdShareBps =
                    stablePair && musd && totalUnits > 0n
                      ? (tokenUnits(musd.amount, musd.token) * 10_000n) /
                        totalUnits
                      : 0n
                  const musdHeavy = musdShareBps > 8_000n

                  return (
                    <tr
                      key={gauge}
                      className="border-b border-[var(--border)] last:border-0"
                    >
                      <th
                        scope="row"
                        className="py-2 pr-4 text-left font-normal"
                      >
                        <a
                          href={config.poolUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[var(--content-primary)] no-underline hover:text-[#F7931A] hover:underline"
                        >
                          {config.name}
                        </a>
                        <span className="ml-2 text-2xs text-[var(--content-tertiary)]">
                          {config.protocol} · {config.network}
                        </span>
                        {musdHeavy && (
                          <Tag closeable={false} color="yellow">
                            MUSD-heavy
                          </Tag>
                        )}
                      </th>
                      <td className="py-2 pr-4 font-mono tabular-nums">
                        {formatCompactUsd(venue.tvlUsd)}
                      </td>
                      <td className="py-2 pr-4">
                        {stablePair && totalUnits > 0n ? (
                          <span className="flex h-3 w-32 overflow-hidden rounded-full bg-[var(--surface-secondary)]">
                            {venue.composition.map((c, i) => {
                              const bps =
                                (tokenUnits(c.amount, c.token) * 10_000n) /
                                totalUnits
                              const pct = Number(bps) / 100
                              return (
                                <span
                                  key={c.token}
                                  title={`${c.token}: ${pct}% of token units`}
                                  style={{
                                    width: `${pct}%`,
                                    backgroundColor: gaugeColor(i),
                                  }}
                                />
                              )
                            })}
                          </span>
                        ) : venue.composition.length > 0 ? (
                          <span className="font-mono text-xs">
                            {venue.composition
                              .map((c) => formatTokenAmount(c.amount, c.token))
                              .join(" · ")}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="py-2 pr-4 font-mono tabular-nums">
                        {formatCompactUsd(venue.volume24hUsd)}
                      </td>
                      <td className="py-2 pr-4 font-mono tabular-nums">
                        {formatCompactUsd(venue.volume7dUsd)}
                      </td>
                      <td className="py-2 pr-4 font-mono tabular-nums">
                        {usdDelta(
                          venue.tvlUsd,
                          BASELINE_BY_GAUGE[gauge.toLowerCase()],
                        )}
                      </td>
                      <td className="py-2 text-2xs text-[var(--content-tertiary)]">
                        {SOURCE_LABELS[venue.source] ?? venue.source}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </section>
  )
}
