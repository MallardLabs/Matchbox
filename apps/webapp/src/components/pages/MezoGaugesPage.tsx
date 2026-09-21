import { EpochHistoryTable } from "@/components/mezoGauges/EpochHistoryTable"
import { GaugesTable } from "@/components/mezoGauges/GaugesTable"
import { LiquidityTable } from "@/components/mezoGauges/LiquidityTable"
import { LocksChart } from "@/components/mezoGauges/LocksChart"
import { MerklSection } from "@/components/mezoGauges/MerklSection"
import { ParticipationStats } from "@/components/mezoGauges/ParticipationStats"
import { TopVoters } from "@/components/mezoGauges/TopVoters"
import { useNetwork } from "@/contexts/NetworkContext"
import { useMezoGaugesEmissions } from "@/hooks/useMezoGaugesEmissions"
import { useMezoGaugesHistory } from "@/hooks/useMezoGaugesHistory"
import { useMezoGaugesLiquidity } from "@/hooks/useMezoGaugesLiquidity"
import { useMezoGaugesMerkl } from "@/hooks/useMezoGaugesMerkl"
import { useMezoGaugesSnapshot } from "@/hooks/useMezoGaugesSnapshot"
import { useVeMezoNewLocks } from "@/hooks/useVeMezoNewLocks"
import { useVoteWindowCountdown } from "@/hooks/useVoteWindowCountdown"
import { Card } from "@mezo-org/mezo-clay"
import { CHAIN_ID } from "@repo/shared/contracts"
import Link from "next/link"

export default function MezoGaugesPage(): JSX.Element {
  const { chainId } = useNetwork()
  const { epochIndex, voteWindowClosed, timeRemaining } =
    useVoteWindowCountdown()

  const {
    snapshot,
    isLoading: snapshotLoading,
    error: snapshotError,
  } = useMezoGaugesSnapshot()
  const {
    entries: history,
    isLoading: historyLoading,
    error: historyError,
  } = useMezoGaugesHistory()
  const {
    emissions,
    isLoading: emissionsLoading,
    error: emissionsError,
  } = useMezoGaugesEmissions()
  const {
    venues,
    isLoading: liquidityLoading,
    error: liquidityError,
  } = useMezoGaugesLiquidity()
  const {
    campaigns,
    claims,
    isLoading: merklLoading,
    error: merklError,
  } = useMezoGaugesMerkl()
  const {
    locks,
    isLoading: locksLoading,
    error: locksError,
  } = useVeMezoNewLocks()

  if (chainId === CHAIN_ID.testnet) {
    return (
      <main>
        <Card title="MEZO gauges" withBorder overrides={{}}>
          <p className="py-4 text-sm text-[var(--content-secondary)]">
            MEZO gauges are only available on Mezo mainnet
          </p>
        </Card>
      </main>
    )
  }

  return (
    <main className="flex flex-col gap-6">
      <header>
        <h1 className="mb-2 text-2xl font-semibold text-[var(--content-primary)]">
          MEZO gauges
        </h1>
        <p className="max-w-3xl text-sm text-[var(--content-secondary)]">
          veMEZO holders vote weekly to direct the non-staking share of MEZO
          emissions to MUSD pools on Curve, Uniswap and Aerodrome.
        </p>
        <p className="mt-1 text-xs text-[var(--content-tertiary)]">
          Epoch E{epochIndex} ·{" "}
          {voteWindowClosed
            ? `vote window closed · next epoch starts in ${timeRemaining}`
            : `vote window closes in ${timeRemaining}`}
        </p>
        <div className="mt-3 flex items-center gap-4">
          <Link
            href="/boost?view=mezo-gauges"
            className="inline-flex items-center gap-1 rounded-lg bg-[#F7931A] px-3 py-1.5 text-sm font-medium text-white no-underline hover:opacity-90"
          >
            Vote with veMEZO
          </Link>
          <a
            href="https://mezo.org/docs/users/mezo-earn/vote/mezo-gauges/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-[var(--content-secondary)] underline hover:text-[#F7931A]"
          >
            mezo.org voting docs
          </a>
        </div>
      </header>

      <ParticipationStats
        snapshot={snapshot}
        history={history}
        isLoading={snapshotLoading}
        error={snapshotError}
      />

      <EpochHistoryTable
        entries={history}
        isLoading={historyLoading}
        error={historyError}
      />

      <GaugesTable
        snapshot={snapshot}
        emissions={emissions}
        isLoading={snapshotLoading || emissionsLoading}
        error={snapshotError ?? emissionsError}
      />

      <LiquidityTable
        venues={venues}
        isLoading={liquidityLoading}
        error={liquidityError}
      />

      <MerklSection
        campaigns={campaigns}
        claims={claims}
        isLoading={merklLoading}
        error={merklError}
      />

      <LocksChart locks={locks} isLoading={locksLoading} error={locksError} />

      <TopVoters snapshot={snapshot} />
    </main>
  )
}
