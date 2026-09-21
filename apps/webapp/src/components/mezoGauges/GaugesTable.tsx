import { TokenIcon } from "@/components/TokenIcon"
import { MEZO_GAUGES } from "@/lib/mezoGauges/constants"
import { formatBps } from "@/lib/mezoGauges/participation"
import type {
  MezoGaugesEmissions,
  MezoGaugesSnapshot,
} from "@/lib/mezoGauges/schema"
import { Card, Skeleton, Tag } from "@mezo-org/mezo-clay"
import { CONTRACTS } from "@repo/shared/contracts"

import { SectionError, formatCompactNumber } from "./shared"

const KNOWN_TOKENS: Record<string, string> = {
  [CONTRACTS.mainnet.mezoToken.toLowerCase()]: "MEZO",
}

function tokenSymbol(address: string): string {
  return (
    KNOWN_TOKENS[address.toLowerCase()] ??
    `${address.slice(0, 6)}…${address.slice(-4)}`
  )
}

function GaugeRow({
  gauge,
  lastEpochAmount,
  bribeRewards,
}: {
  gauge: MezoGaugesSnapshot["gauges"][number]
  lastEpochAmount: bigint | null
  bribeRewards: { token: string; amount: string }[] | undefined
}): JSX.Element {
  const config = MEZO_GAUGES[gauge.address as keyof typeof MEZO_GAUGES]
  const incentives = (bribeRewards ?? []).filter((r) => BigInt(r.amount) > 0n)
  return (
    <tr className="border-b border-[var(--border)] last:border-0">
      <th scope="row" className="py-2 pr-4 text-left font-normal">
        {config?.poolUrl ? (
          <a
            href={config.poolUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--content-primary)] no-underline hover:text-[#F7931A] hover:underline"
          >
            {gauge.name}
          </a>
        ) : (
          <span className="font-mono text-[var(--content-primary)]">
            {gauge.name === "Unlisted gauge"
              ? `${gauge.address.slice(0, 8)}…${gauge.address.slice(-6)}`
              : gauge.name}
          </span>
        )}
        <span className="ml-2 inline-flex gap-1 align-middle">
          <Tag closeable={false} color="gray">
            {gauge.protocol}
          </Tag>
          {config && (
            <Tag closeable={false} color="blue">
              {config.network}
            </Tag>
          )}
          {config?.merklUrl && (
            <a
              href={config.merklUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex"
              aria-label={`${gauge.name} Merkl campaign`}
            >
              <Tag closeable={false} color="yellow">
                Merkl
              </Tag>
            </a>
          )}
        </span>
      </th>
      <td className="py-2 pr-4">
        <Tag closeable={false} color={gauge.isAlive ? "green" : "red"}>
          {gauge.isAlive ? "alive" : "killed"}
        </Tag>
      </td>
      <td className="py-2 pr-4 font-mono tabular-nums">
        {formatCompactNumber(BigInt(gauge.weight))}
      </td>
      <td className="py-2 pr-4 font-mono tabular-nums">
        {formatBps(BigInt(gauge.shareBps))}
      </td>
      <td className="py-2 pr-4 font-mono tabular-nums">
        {lastEpochAmount === null ? "—" : formatCompactNumber(lastEpochAmount)}
      </td>
      <td className="py-2 font-mono tabular-nums">
        {incentives.length === 0
          ? "—"
          : incentives.map((r) => (
              <span
                key={r.token}
                className="mr-2 inline-flex items-center gap-1"
              >
                <TokenIcon symbol={tokenSymbol(r.token)} size={14} />
                {formatCompactNumber(BigInt(r.amount))}
              </span>
            ))}
      </td>
    </tr>
  )
}

export function GaugesTable({
  snapshot,
  emissions,
  isLoading,
  error,
}: {
  snapshot: MezoGaugesSnapshot | undefined
  emissions: MezoGaugesEmissions | undefined
  isLoading: boolean
  error: Error | null
}): JSX.Element {
  if (isLoading) {
    return (
      <section aria-labelledby="mezo-gauges-list">
        <Skeleton width="100%" height="180px" animation />
      </section>
    )
  }
  if (error || !snapshot) {
    return (
      <section aria-labelledby="mezo-gauges-list">
        <SectionError message="Unable to load gauges." />
      </section>
    )
  }

  const closedEpochs = (emissions?.distributedByEpoch ?? []).filter(
    (e) => e.epochStart < (emissions?.currentEpochStart ?? 0),
  )
  const lastClosed = closedEpochs.at(-1)
  const lastEpochAmounts = new Map(
    (lastClosed?.gauges ?? []).map((g) => [
      g.gauge.toLowerCase(),
      BigInt(g.amount),
    ]),
  )
  const bribesByGauge = new Map(
    (emissions?.currentEpochBribes ?? []).map((b) => [
      b.gauge.toLowerCase(),
      b.rewards,
    ]),
  )

  const listed = snapshot.gauges.filter((g) => g.listed)
  const unlisted = snapshot.gauges.filter((g) => !g.listed)

  const head = (
    <thead>
      <tr className="border-b border-[var(--border)] text-left text-2xs uppercase tracking-wider text-[var(--content-tertiary)]">
        <th scope="col" className="py-2 pr-4 font-medium">
          Gauge
        </th>
        <th scope="col" className="py-2 pr-4 font-medium">
          Status
        </th>
        <th scope="col" className="py-2 pr-4 font-medium">
          Weight (veMEZO)
        </th>
        <th scope="col" className="py-2 pr-4 font-medium">
          Share
        </th>
        <th scope="col" className="py-2 pr-4 font-medium">
          MEZO last epoch
        </th>
        <th scope="col" className="py-2 font-medium">
          Incentives this epoch
        </th>
      </tr>
    </thead>
  )

  return (
    <section aria-labelledby="mezo-gauges-list">
      <Card title="Gauges" withBorder overrides={{}}>
        <h2
          id="mezo-gauges-list"
          className="py-2 text-sm font-medium text-[var(--content-secondary)]"
        >
          Where votes are going this epoch
        </h2>
        <div className="overflow-x-auto pb-4">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <caption className="sr-only">
              MEZO gauges with current weight, share, last epoch emissions and
              current epoch incentives
            </caption>
            {head}
            <tbody>
              {listed.map((g) => (
                <GaugeRow
                  key={g.address}
                  gauge={g}
                  lastEpochAmount={
                    lastEpochAmounts.get(g.address.toLowerCase()) ?? null
                  }
                  bribeRewards={bribesByGauge.get(g.address.toLowerCase())}
                />
              ))}
            </tbody>
          </table>
        </div>
        {unlisted.length > 0 && (
          <details className="pb-4">
            <summary className="cursor-pointer text-xs text-[var(--content-secondary)]">
              Unlisted / killed gauges ({unlisted.length})
            </summary>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-sm">
                <caption className="sr-only">
                  Gauges with votes that are not in the registry
                </caption>
                {head}
                <tbody>
                  {unlisted.map((g) => (
                    <GaugeRow
                      key={g.address}
                      gauge={g}
                      lastEpochAmount={
                        lastEpochAmounts.get(g.address.toLowerCase()) ?? null
                      }
                      bribeRewards={bribesByGauge.get(g.address.toLowerCase())}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}
      </Card>
    </section>
  )
}
