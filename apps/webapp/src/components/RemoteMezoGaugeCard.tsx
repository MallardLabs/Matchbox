import { TokenIcon } from "@/components/TokenIcon"
import type { RemoteMezoPoolCard } from "@/hooks/useRemoteMezoPools"
import { formatUsdValue } from "@/hooks/useTokenPrices"
import {
  type MezoGaugeProtocol,
  formatDistributionDate,
} from "@/lib/mezoGauges"
import { formatMicroUsd } from "@/utils/validatorApy"
import { Tag } from "@mezo-org/mezo-clay"
import Link from "next/link"

function networkLabel(network: RemoteMezoPoolCard["geckoNetwork"]): string {
  if (network === "base") return "Base"
  return "Ethereum"
}

function protocolColor(
  protocol: MezoGaugeProtocol,
): "blue" | "green" | "purple" {
  if (protocol === "Aerodrome") return "green"
  if (protocol === "Curve") return "blue"
  return "purple"
}

type RemoteMezoGaugeCardProps = {
  pool: RemoteMezoPoolCard
}

export default function RemoteMezoGaugeCard({
  pool,
}: RemoteMezoGaugeCardProps): JSX.Element {
  const identity = pool.mezo?.identity
  const title = identity?.name ?? pool.venueName ?? "Remote MEZO gauge"
  const protocol = identity?.protocol ?? "Remote"
  const voteHref = "/boost?view=mezo-gauges"

  return (
    <article className="group relative flex h-full min-w-0 flex-col gap-4 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex items-start justify-between gap-3">
        <a
          href={identity?.poolUrl}
          target="_blank"
          rel="noreferrer"
          className="flex min-w-0 items-center gap-3 text-inherit no-underline"
        >
          <ul className="flex flex-shrink-0">
            {(identity?.tokens ?? ["MEZO"]).map((token, index) => (
              <li
                key={token}
                className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-[var(--border)] bg-[var(--surface-secondary)]"
                style={{ marginLeft: index === 0 ? 0 : -8 }}
              >
                <TokenIcon
                  symbol={token}
                  size={18}
                  className="h-[18px] w-[18px]"
                />
              </li>
            ))}
          </ul>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-semibold text-[var(--content-primary)]">
              {title}
            </h3>
            <p className="mt-0.5 truncate text-2xs text-[var(--content-tertiary)]">
              {identity?.action ?? "Official remote MEZO gauge"}
            </p>
          </div>
        </a>
        <div className="flex flex-shrink-0 flex-col items-end gap-1">
          {identity ? (
            <Tag color={protocolColor(identity.protocol)} closeable={false}>
              {protocol}
            </Tag>
          ) : (
            <Tag color="gray" closeable={false}>
              Remote
            </Tag>
          )}
          <Tag color="gray" closeable={false}>
            {networkLabel(pool.geckoNetwork)}
          </Tag>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <dt className="text-[var(--content-tertiary)]">TVL</dt>
          <dd className="font-mono tabular-nums text-[var(--content-primary)]">
            {formatUsdValue(pool.reserveUsd)}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--content-tertiary)]">24h Volume</dt>
          <dd className="font-mono tabular-nums text-[var(--content-primary)]">
            {formatUsdValue(pool.volume24hUsd)}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--content-tertiary)]">Mezo Incentives</dt>
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

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-[var(--border)] pt-3">
        {identity ? (
          <a
            href={identity.poolUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-[var(--content-secondary)] no-underline hover:text-[#F7931A]"
          >
            Open on {protocol}
          </a>
        ) : (
          <span className="text-xs text-[var(--content-tertiary)]">
            Venue link unavailable
          </span>
        )}
        <Link
          href={voteHref}
          className="text-xs font-semibold text-[#F7931A] no-underline"
        >
          Vote with veMEZO
        </Link>
      </div>
    </article>
  )
}
