import AddMezoGaugeIncentiveModal from "@/components/AddMezoGaugeIncentiveModal"
import { ClickableAddress } from "@/components/ClickableAddress"
import { TokenStackIcon } from "@/components/PoolCard"
import { TokenIcon } from "@/components/TokenIcon"
import useMezoGauges from "@/hooks/useMezoGauges"
import useRemoteMezoPools from "@/hooks/useRemoteMezoPools"
import { formatUsdValue } from "@/hooks/useTokenPrices"
import {
  formatDistributionDate,
  mezoGaugeIdentity,
  mezoVenueTokenIconSymbol,
  mezoVenueTokenIconSymbols,
} from "@/lib/mezoGauges"
import { formatMicroUsd } from "@/utils/validatorApy"
import { Button, Skeleton } from "@mezo-org/mezo-clay"
import Link from "next/link"
import { useMemo, useState } from "react"
import { formatUnits, getAddress, isAddress } from "viem"

type MezoGaugeDetailPageProps = {
  address: string
}

function formatAmount(value: bigint, decimals = 18, precision = 4): string {
  const formatted = formatUnits(value, decimals)
  const [whole = "0", fraction = ""] = formatted.split(".")
  const trimmed = fraction.slice(0, precision).replace(/0+$/, "")
  return trimmed ? `${whole}.${trimmed}` : whole
}

function formatVenueUsd(value: number | null | undefined): string {
  if (value == null) return "—"
  return formatUsdValue(value)
}

export default function MezoGaugeDetailPage({
  address,
}: MezoGaugeDetailPageProps): JSX.Element {
  const [incentiveOpen, setIncentiveOpen] = useState(false)
  const gauge = isAddress(address) ? getAddress(address) : undefined
  const identity = gauge ? mezoGaugeIdentity(gauge) : undefined
  const { rows, isLoading, isError, refetch } = useMezoGauges()
  const { pools } = useRemoteMezoPools()
  const row = useMemo(
    () =>
      rows?.find((item) => item.gauge.toLowerCase() === address.toLowerCase()),
    [address, rows],
  )
  const venue = useMemo(
    () =>
      pools.find((pool) => pool.gauge.toLowerCase() === address.toLowerCase()),
    [address, pools],
  )

  if (!gauge || !identity) {
    return (
      <div className="flex flex-col gap-3">
        <Link
          href="/boost?view=mezo-gauges"
          className="text-xs text-[var(--content-secondary)] no-underline hover:text-[#F7931A]"
        >
          ← MEZO Gauges
        </Link>
        <p className="text-sm text-[var(--content-secondary)]">
          This address is not an official MEZO gauge.
        </p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton width="100%" height="96px" animation />
        <Skeleton width="100%" height="220px" animation />
      </div>
    )
  }

  if (isError) {
    return (
      <p className="rounded-lg border border-[var(--negative)] p-3 text-sm text-[var(--negative)]">
        Failed to load this MEZO gauge.
      </p>
    )
  }

  const weight = row?.weight ?? 0n
  const incentives = row?.incentives ?? []

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/boost?view=mezo-gauges"
          className="mb-3 inline-flex items-center gap-1 text-xs text-[var(--content-secondary)] no-underline hover:text-[#F7931A]"
        >
          ← MEZO Gauges
        </Link>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <TokenStackIcon
              symbols={mezoVenueTokenIconSymbols(identity.tokens)}
              size={44}
            />
            <div className="min-w-0">
              <h1 className="text-balance text-2xl font-semibold text-[var(--content-primary)]">
                {identity.name}
              </h1>
              <p className="mt-1 font-mono text-xs text-[var(--content-tertiary)]">
                <ClickableAddress address={gauge} />
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href={identity.poolUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-semibold text-[#F7931A] no-underline"
            >
              Open on {identity.protocol}
            </a>
            <Link
              href="/boost?view=mezo-gauges"
              className="inline-flex items-center rounded-lg bg-[#F7931A] px-3 py-2 text-sm font-semibold text-black no-underline"
            >
              Vote with veMEZO
            </Link>
          </div>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <dt className="text-2xs uppercase tracking-wider text-[var(--content-tertiary)]">
            TVL
          </dt>
          <dd className="mt-1 font-mono text-xl font-semibold tabular-nums text-[var(--content-primary)]">
            {formatVenueUsd(venue?.reserveUsd)}
          </dd>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <dt className="text-2xs uppercase tracking-wider text-[var(--content-tertiary)]">
            24h Volume
          </dt>
          <dd className="mt-1 font-mono text-xl font-semibold tabular-nums text-[var(--content-primary)]">
            {formatVenueUsd(venue?.volume24hUsd)}
          </dd>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <dt className="text-2xs uppercase tracking-wider text-[var(--content-tertiary)]">
            Emissions
          </dt>
          <dd className="mt-1 font-mono text-xl font-semibold tabular-nums text-[var(--content-primary)]">
            {row ? formatMicroUsd(row.incentivesMicroUsd) : "—"}
          </dd>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <dt className="text-2xs uppercase tracking-wider text-[var(--content-tertiary)]">
            Weight
          </dt>
          <dd className="mt-1 font-mono text-xl font-semibold tabular-nums text-[var(--content-primary)]">
            {formatAmount(weight)} veMEZO
          </dd>
        </div>
      </dl>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-[var(--content-primary)]">
              Incentives
            </h2>
            <p className="mt-0.5 text-pretty text-xs text-[var(--content-secondary)]">
              Deposits go to this epoch&apos;s MEZO Gauges bribe pot.
              Distribution{" "}
              {row ? formatDistributionDate(row.distributionDate) : "—"}.
            </p>
          </div>
          <Button
            kind="primary"
            size="small"
            onClick={() => setIncentiveOpen(true)}
            disabled={!row?.isAlive}
          >
            Add incentives
          </Button>
        </div>
        {incentives.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--content-secondary)]">
            No incentives posted for this epoch yet.
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-2">
            {incentives.map((incentive) => (
              <li
                key={incentive.tokenAddress}
                className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] px-3 py-2"
              >
                <span className="inline-flex items-center gap-2 text-sm text-[var(--content-primary)]">
                  <TokenIcon
                    symbol={mezoVenueTokenIconSymbol(incentive.symbol)}
                    size={20}
                  />
                  {incentive.symbol}
                </span>
                <span className="font-mono text-sm tabular-nums text-[var(--content-primary)]">
                  {formatAmount(incentive.amount, incentive.decimals)} ·{" "}
                  {formatMicroUsd(incentive.valueMicroUsd)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {row ? (
        <AddMezoGaugeIncentiveModal
          gauge={row.gauge}
          gaugeName={identity.name}
          weight={weight}
          isOpen={incentiveOpen}
          onClose={() => setIncentiveOpen(false)}
          onAdded={() => refetch()}
        />
      ) : null}
    </div>
  )
}
