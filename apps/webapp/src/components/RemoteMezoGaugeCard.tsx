import { TokenStackIcon } from "@/components/PoolCard"
import type { RemoteMezoPoolCard } from "@/hooks/useRemoteMezoPools"
import { formatUsdValue } from "@/hooks/useTokenPrices"
import {
  formatDistributionDate,
  mezoVenueTokenIconSymbols,
} from "@/lib/mezoGauges"
import { formatMicroUsd } from "@/utils/validatorApy"
import Link from "next/link"

type RemoteMezoGaugeCardProps = {
  pool: RemoteMezoPoolCard
}

function formatVenueUsd(value: number | null): string {
  if (value === null) return "—"
  return formatUsdValue(value)
}

export default function RemoteMezoGaugeCard({
  pool,
}: RemoteMezoGaugeCardProps): JSX.Element {
  const identity = pool.identity
  const detailHref = `/mezo-gauges/${pool.gauge}`

  return (
    <article className="group relative flex h-full min-w-0 flex-col gap-4 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex min-w-0 items-start gap-3">
        <Link
          href={detailHref}
          className="flex min-w-0 items-center gap-3 text-inherit no-underline"
        >
          <TokenStackIcon
            symbols={mezoVenueTokenIconSymbols(identity.tokens)}
            size={32}
          />
          <h3 className="truncate text-sm font-semibold text-[var(--content-primary)]">
            {identity.name}
          </h3>
        </Link>
      </div>

      <dl className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <dt className="text-[var(--content-tertiary)]">TVL</dt>
          <dd className="font-mono tabular-nums text-[var(--content-primary)]">
            {formatVenueUsd(pool.reserveUsd)}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--content-tertiary)]">24h Volume</dt>
          <dd className="font-mono tabular-nums text-[var(--content-primary)]">
            {formatVenueUsd(pool.volume24hUsd)}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--content-tertiary)]">Emissions</dt>
          <dd className="font-mono tabular-nums text-[var(--content-primary)]">
            {pool.mezo ? formatMicroUsd(pool.mezo.incentivesMicroUsd) : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--content-tertiary)]">Distribution</dt>
          <dd className="font-mono tabular-nums text-[var(--content-primary)]">
            {pool.mezo
              ? formatDistributionDate(pool.mezo.distributionDate)
              : "—"}
          </dd>
        </div>
      </dl>

      <div className="mt-auto border-t border-[var(--border)] pt-3">
        <a
          href={identity.poolUrl}
          target="_blank"
          rel="noreferrer"
          className="text-sm font-semibold text-[#F7931A] no-underline hover:underline"
        >
          Open on {identity.protocol}
        </a>
      </div>
    </article>
  )
}
