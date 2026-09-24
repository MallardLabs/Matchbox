import { AddressLink } from "@/components/AddressLink"
import { formatBps } from "@/lib/mezoGauges/participation"
import type {
  MezoGaugesHistory,
  MezoGaugesSnapshot,
} from "@/lib/mezoGauges/schema"
import { Card, Skeleton, Tag } from "@mezo-org/mezo-clay"
import type { Address } from "viem"
import { CountDelta, Delta, SectionError, formatCompactNumber } from "./shared"

type Props = {
  snapshot: MezoGaugesSnapshot | undefined
  history: MezoGaugesHistory["entries"]
  isLoading: boolean
  error: Error | null
}

function Stat({
  term,
  children,
  deltas,
}: {
  term: string
  children: React.ReactNode
  deltas?: React.ReactNode
}): JSX.Element {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <dt className="mb-1 text-2xs uppercase tracking-wider text-[var(--content-tertiary)]">
        {term}
      </dt>
      <dd className="font-mono text-2xl font-semibold tabular-nums text-[var(--content-primary)]">
        {children}
      </dd>
      {deltas && <dd className="mt-2 flex flex-col gap-0.5">{deltas}</dd>}
    </div>
  )
}

export function ParticipationStats({
  snapshot,
  history,
  isLoading,
  error,
}: Props): JSX.Element {
  if (isLoading) {
    return <Skeleton width="100%" height="160px" animation />
  }
  if (error || !snapshot) {
    return <SectionError message="Unable to load participation data." />
  }

  const baseline = history.find((e) => e.kind === "baseline")?.snapshot
  const closes = history.filter((e) => e.kind === "epochClose")
  const prevClose = closes.at(-1)?.snapshot
  const prevLabel =
    prevClose === undefined
      ? "vs prev close"
      : `vs E${prevClose.epochIndex} close`

  const bps = BigInt(snapshot.participationBps)
  const prevBps = prevClose ? BigInt(prevClose.participationBps) : null
  const baseBps = baseline ? BigInt(baseline.participationBps) : null

  const top = snapshot.topWallet
  const prevTop = prevClose?.topWallet
    ? BigInt(prevClose.topWallet.shareBps)
    : null
  const baseTop = baseline?.topWallet
    ? BigInt(baseline.topWallet.shareBps)
    : null

  const reconciledTag = snapshot.reconciled ? (
    <Tag closeable={false} color="green">
      on-chain reconciled
    </Tag>
  ) : (
    <Tag closeable={false} color="yellow">
      subgraph diverges by{" "}
      {formatCompactNumber(BigInt(snapshot.reconciliationDiff))} veMEZO
    </Tag>
  )

  return (
    <section aria-labelledby="mezo-gauges-participation">
      <Card title="Participation" withBorder overrides={{}}>
        <div className="flex items-center justify-between gap-2 py-2">
          <h2
            id="mezo-gauges-participation"
            className="text-sm font-medium text-[var(--content-secondary)]"
          >
            Vote participation
          </h2>
          {reconciledTag}
        </div>
        <dl className="grid grid-cols-1 gap-3 pb-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            term="Participation"
            deltas={
              <>
                <Delta
                  diffBps={prevBps === null ? null : bps - prevBps}
                  label={prevLabel}
                />
                <Delta
                  diffBps={baseBps === null ? null : bps - baseBps}
                  label="vs 7 Sep baseline"
                />
              </>
            }
          >
            {formatBps(bps)}
            <span className="mt-1 block font-mono text-xs font-normal text-[var(--content-secondary)]">
              {formatCompactNumber(BigInt(snapshot.totalWeight))} veMEZO voted
              of {formatCompactNumber(BigInt(snapshot.totalVotingPower))} voting
              power
            </span>
          </Stat>
          <Stat
            term="Voting NFTs"
            deltas={
              <>
                <CountDelta
                  diff={
                    prevClose
                      ? snapshot.votingNfts - prevClose.votingNfts
                      : null
                  }
                  label={prevLabel}
                />
                <CountDelta
                  diff={
                    baseline ? snapshot.votingNfts - baseline.votingNfts : null
                  }
                  label="vs 7 Sep baseline"
                />
              </>
            }
          >
            {snapshot.votingNfts}
          </Stat>
          <Stat
            term="Distinct wallets"
            deltas={
              <>
                <CountDelta
                  diff={prevClose ? snapshot.wallets - prevClose.wallets : null}
                  label={prevLabel}
                />
                <CountDelta
                  diff={baseline ? snapshot.wallets - baseline.wallets : null}
                  label="vs 7 Sep baseline"
                />
              </>
            }
          >
            {snapshot.wallets}
          </Stat>
          <Stat
            term="Largest voter share"
            deltas={
              <>
                <Delta
                  diffBps={
                    top && prevTop !== null
                      ? BigInt(top.shareBps) - prevTop
                      : null
                  }
                  label={prevLabel}
                />
                <Delta
                  diffBps={
                    top && baseTop !== null
                      ? BigInt(top.shareBps) - baseTop
                      : null
                  }
                  label="vs 7 Sep baseline"
                />
              </>
            }
          >
            {top ? formatBps(BigInt(top.shareBps)) : "—"}
            {top && (
              <span className="mt-1 block">
                <AddressLink address={top.owner as Address} />
              </span>
            )}
          </Stat>
        </dl>
      </Card>
    </section>
  )
}
