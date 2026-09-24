import { BASELINE, MEZO_GAUGES } from "@/lib/mezoGauges/constants"
import { formatBps } from "@/lib/mezoGauges/participation"
import type { MezoGaugesMerkl } from "@/lib/mezoGauges/schema"
import { Card, Skeleton } from "@mezo-org/mezo-clay"

import { SectionError, formatCompactNumber } from "./shared"

function formatDate(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  })
}

function ClaimsStat({
  term,
  children,
  sub,
}: {
  term: string
  children: React.ReactNode
  sub?: React.ReactNode
}): JSX.Element {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <dt className="mb-1 text-2xs uppercase tracking-wider text-[var(--content-tertiary)]">
        {term}
      </dt>
      <dd className="font-mono text-xl font-semibold tabular-nums text-[var(--content-primary)]">
        {children}
      </dd>
      {sub && (
        <dd className="mt-1 text-2xs text-[var(--content-tertiary)]">{sub}</dd>
      )}
    </div>
  )
}

export function MerklSection({
  campaigns,
  claims,
  isLoading,
  error,
}: {
  campaigns: MezoGaugesMerkl["campaigns"]
  claims: MezoGaugesMerkl["claims"] | undefined
  isLoading: boolean
  error: Error | null
}): JSX.Element {
  const now = Math.floor(Date.now() / 1000)
  const liveCampaigns = Object.entries(campaigns).flatMap(([gauge, list]) =>
    list
      .filter(
        (c) =>
          c.startTimestamp !== null &&
          c.endTimestamp !== null &&
          c.startTimestamp <= now &&
          c.endTimestamp >= now,
      )
      .map((c) => ({ gauge, campaign: c })),
  )

  const rateDelta = (() => {
    if (!claims || claims.status !== "ok") return null
    const diff =
      BigInt(claims.claimRateBps) - BigInt(BASELINE.merkl.claimRateBps)
    return diff
  })()

  return (
    <section aria-labelledby="mezo-gauges-merkl">
      <Card title="Merkl claims" withBorder overrides={{}}>
        <h2
          id="mezo-gauges-merkl"
          className="py-2 text-sm font-medium text-[var(--content-secondary)]"
        >
          Wrapped-veMEZO rewards on Curve and Uniswap v4
        </h2>
        {isLoading ? (
          <Skeleton width="100%" height="120px" animation />
        ) : error || !claims || claims.status !== "ok" ? (
          <SectionError message="Merkl claims data unavailable." />
        ) : (
          <>
            <dl className="grid grid-cols-2 gap-3 pb-4 sm:grid-cols-3 lg:grid-cols-5">
              <ClaimsStat term="Distributed">
                {formatCompactNumber(BigInt(claims.distributed))}
              </ClaimsStat>
              <ClaimsStat term="Claimed">
                {formatCompactNumber(BigInt(claims.claimed))}
              </ClaimsStat>
              <ClaimsStat
                term="Claim rate"
                sub={
                  rateDelta === null
                    ? undefined
                    : `vs baseline 37.07%: ${rateDelta >= 0n ? "+" : "−"}${formatBps(rateDelta < 0n ? -rateDelta : rateDelta).replace("%", "pp")}`
                }
              >
                {formatBps(BigInt(claims.claimRateBps))}
              </ClaimsStat>
              <ClaimsStat term="Unclaimed">
                {formatCompactNumber(BigInt(claims.unclaimed))}
              </ClaimsStat>
              <ClaimsStat term="Claimants">{claims.claimants}</ClaimsStat>
            </dl>
            {liveCampaigns.length > 0 && (
              <ul className="m-0 flex list-none flex-col gap-1 p-0 pb-4">
                {liveCampaigns.map(({ gauge, campaign }) => {
                  const config = MEZO_GAUGES[gauge as keyof typeof MEZO_GAUGES]
                  return (
                    <li
                      key={campaign.id}
                      className="flex flex-wrap items-center gap-2 text-xs text-[var(--content-secondary)]"
                    >
                      <span className="font-medium text-[var(--content-primary)]">
                        {config?.name ?? gauge}
                      </span>
                      <span className="font-mono tabular-nums">
                        {campaign.amount
                          ? `${formatCompactNumber(BigInt(campaign.amount))} veMEZO`
                          : "—"}
                      </span>
                      {campaign.apr && (
                        <span>
                          APR {Math.round(Number(campaign.apr) * 10) / 10}%
                        </span>
                      )}
                      {campaign.startTimestamp !== null &&
                        campaign.endTimestamp !== null && (
                          <span className="text-[var(--content-tertiary)]">
                            {formatDate(campaign.startTimestamp)} –{" "}
                            {formatDate(campaign.endTimestamp)}
                          </span>
                        )}
                    </li>
                  )
                })}
              </ul>
            )}
          </>
        )}
      </Card>
    </section>
  )
}
