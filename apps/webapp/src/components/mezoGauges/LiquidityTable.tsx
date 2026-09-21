import { BASELINE, MEZO_GAUGES } from "@/lib/mezoGauges/constants"
import type { MezoGaugesLiquidityResponse } from "@/lib/mezoGauges/schema"
import { Card, Skeleton, Tag } from "@mezo-org/mezo-clay"

import { SectionError, formatCompactUsd, gaugeColor } from "./shared"

const TOKEN_DECIMALS: Record<string, number> = { USDC: 6, MUSD: 18, MEZO: 18 }

const SOURCE_LABELS: Record<string, string> = {
  defillama: "DefiLlama",
  "curve-api": "Curve API",
  "onchain-composition": "on-chain",
}

const BASELINE_BY_GAUGE: Record<string, string> = {
  "0xC7e81dd77A4624F0DD14A8bB97Bc721b0CEE6e26":
    BASELINE.liquidityUsd.aerodromeUsdcMusd,
  "0x4440A9b2954cB98416C0122e2ea996C46555F4B6":
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

                  const totalUnits = venue.composition.reduce(
                    (sum, c) =>
                      sum +
                      Number(c.amount) / 10 ** (TOKEN_DECIMALS[c.token] ?? 18),
                    0,
                  )
                  const musdShare = (() => {
                    const musd = venue.composition.find(
                      (c) => c.token === "MUSD",
                    )
                    if (!musd || totalUnits <= 0) return 0
                    return (Number(musd.amount) / 1e18 / totalUnits) * 100
                  })()
                  const musdHeavy =
                    venue.composition.length === 2 && musdShare > 80

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
                        {venue.composition.length > 0 ? (
                          <span className="flex h-3 w-32 overflow-hidden rounded-full bg-[var(--surface-secondary)]">
                            {venue.composition.map((c, i) => {
                              const units =
                                Number(c.amount) /
                                10 ** (TOKEN_DECIMALS[c.token] ?? 18)
                              const pct =
                                totalUnits > 0 ? (units / totalUnits) * 100 : 0
                              return (
                                <span
                                  key={c.token}
                                  title={`${c.token}: ${pct.toFixed(1)}%`}
                                  style={{
                                    width: `${pct}%`,
                                    backgroundColor: gaugeColor(i),
                                  }}
                                />
                              )
                            })}
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
                        {usdDelta(venue.tvlUsd, BASELINE_BY_GAUGE[gauge])}
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
