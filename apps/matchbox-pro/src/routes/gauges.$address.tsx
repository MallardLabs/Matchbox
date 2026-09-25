import AddIncentivesSheet from "@/components/gauges/AddIncentivesSheet"
import GaugeHeader from "@/components/gauges/GaugeHeader"
import GaugeHistoryCard from "@/components/gauges/GaugeHistoryCard"
import GaugeIncentivesCard from "@/components/gauges/GaugeIncentivesCard"
import GaugeMetrics from "@/components/gauges/GaugeMetrics"
import GaugeOptimalCard from "@/components/gauges/GaugeOptimalCard"
import GaugeProfileManager from "@/components/gauges/GaugeProfileManager"
import Toast from "@/components/shell/Toast"
import { useWalletDialog } from "@/components/wallet/WalletDialogContext"
import { useBoostGauges } from "@/hooks/useBoostGauges"
import { useGaugeWatchlist } from "@/hooks/useGaugeWatchlist"
import { useBtcPrice, useMezoPrice } from "@/hooks/usePrices"
import { profileForGauge, useGaugeProfiles } from "@/hooks/useProfiles"
import { useTopology } from "@/hooks/useTopology"
import {
  formatApyBasisPoints,
  formatBoost,
  formatMicroUsd,
  formatVeAmount,
  priceToMicroUsd,
} from "@/lib/money"
import { calculateAnnualizedReturnBasisPoints } from "@/lib/rewardOptimizer"
import { tokenUsdMicro } from "@/lib/tokenUsd"
import { Link, createFileRoute } from "@tanstack/react-router"
import { ArrowLeft } from "lucide-react"
import { type ReactElement, useMemo, useState } from "react"
import { useAccount } from "wagmi"

export const Route = createFileRoute("/gauges/$address")({
  component: GaugeDetailPage,
})

type Overlay = "incentives" | "profile" | null

function epochStartLabel(value: string | undefined): string {
  const seconds = Number(value)
  if (!value || !Number.isFinite(seconds) || seconds <= 0) return "Current"
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(seconds * 1000))
}

function BackLink(): ReactElement {
  return (
    <Link
      to="/vote"
      className="inline-flex w-fit items-center gap-1.5 text-[13px] font-500 text-muted transition-colors hover:text-ink"
    >
      <ArrowLeft aria-hidden="true" size={14} strokeWidth={1.75} />
      Vote
    </Link>
  )
}

function GaugeDetailPage(): ReactElement {
  const { address } = Route.useParams()
  const { gauges, isLoading: gaugesLoading } = useBoostGauges()
  const { data: profiles, isLoading: profilesLoading } = useGaugeProfiles()
  const topology = useTopology()
  const { data: btcPrice = null } = useBtcPrice()
  const { data: mezoPrice = null } = useMezoPrice()
  const { isConnected, address: account } = useAccount()
  const { openConnect } = useWalletDialog()
  const { isWatching, toggleWatching } = useGaugeWatchlist()
  const [overlay, setOverlay] = useState<Overlay>(null)
  const [toast, setToast] = useState<string | null>(null)

  const gauge = gauges.find(
    (item) => item.address.toLowerCase() === address.toLowerCase(),
  )
  const profile = profileForGauge(profiles, address)
  const rewardTokens = topology.data?.gauges.find(
    (item) => item.gaugeAddress.toLowerCase() === address.toLowerCase(),
  )?.rewardTokens

  const tokenRows = useMemo(
    () =>
      (rewardTokens ?? []).map((token) => {
        const amount = BigInt(token.epochAmount)
        return {
          ...token,
          amount,
          usd: tokenUsdMicro({
            amount,
            decimals: token.decimals,
            tokenAddress: token.tokenAddress,
            symbol: token.symbol,
            btcPriceUsd: btcPrice,
            mezoPriceUsd: mezoPrice,
          }),
        }
      }),
    [btcPrice, mezoPrice, rewardTokens],
  )

  if ((gaugesLoading || profilesLoading) && !gauge)
    return <GaugeDetailSkeleton />

  if (!gauge) {
    return (
      <section className="flex flex-col gap-5">
        <BackLink />
        <div className="max-w-xl rounded-[10px] bg-inset p-6">
          <h1 className="text-[22px] font-650 text-ink">Gauge not found</h1>
          <p className="mt-2 break-all font-mono text-[12px] text-secondary">
            {address}
          </p>
        </div>
      </section>
    )
  }

  const totalIncentives = tokenRows.reduce((total, row) => total + row.usd, 0n)
  const apy =
    mezoPrice && gauge.totalWeight > 0n
      ? calculateAnnualizedReturnBasisPoints({
          epochRewardMicroUsd: totalIncentives,
          votingPowers: [gauge.totalWeight],
          assetPriceMicroUsd: priceToMicroUsd(mezoPrice),
        })
      : null
  const name = profile?.display_name || `Gauge ${address.slice(0, 6)}`
  const isOwner =
    !!profile &&
    !!account &&
    account.toLowerCase() === profile.owner_address.toLowerCase()
  const incentivesLabel = topology.isLoading
    ? "…"
    : formatMicroUsd(totalIncentives)

  return (
    <section className="flex flex-col gap-5">
      <BackLink />
      <GaugeHeader
        address={address}
        name={name}
        profile={profile}
        isAlive={gauge.isAlive}
        watching={isWatching(address)}
        isOwner={isOwner}
        onToggleWatch={() => toggleWatching(address)}
        onAddIncentives={() =>
          isConnected ? setOverlay("incentives") : openConnect()
        }
        onManageProfile={() => setOverlay("profile")}
      />
      <GaugeMetrics
        metrics={[
          {
            label: "veBTC",
            value: gauge.veBTCWeight ? formatVeAmount(gauge.veBTCWeight) : "—",
          },
          { label: "veMEZO", value: formatVeAmount(gauge.totalWeight) },
          { label: "Boost", value: formatBoost(gauge.boostMultiplier) },
          { label: "APY", value: formatApyBasisPoints(apy), positive: true },
          { label: "Incentives", value: incentivesLabel },
        ]}
      />
      <GaugeOptimalCard gauge={gauge} />
      <GaugeIncentivesCard
        rows={tokenRows}
        totalMicroUsd={totalIncentives}
        loading={topology.isLoading}
        failed={topology.isError}
      />
      <GaugeHistoryCard
        epochLabel={epochStartLabel(topology.data?.epochStart)}
        veMezo={formatVeAmount(gauge.totalWeight)}
        boost={formatBoost(gauge.boostMultiplier)}
        incentives={incentivesLabel}
        apy={formatApyBasisPoints(apy)}
      />

      {overlay === "incentives" ? (
        <AddIncentivesSheet
          gaugeAddress={gauge.address}
          gaugeName={name}
          tokenId={profile?.vebtc_token_id}
          onClose={() => setOverlay(null)}
        />
      ) : null}
      {overlay === "profile" && profile && isOwner ? (
        <GaugeProfileManager
          gaugeAddress={gauge.address}
          profile={profile}
          onClose={() => setOverlay(null)}
          onSaved={setToast}
        />
      ) : null}
      <Toast message={toast} onDone={() => setToast(null)} />
    </section>
  )
}

function GaugeDetailSkeleton(): ReactElement {
  return (
    <section
      aria-label="Loading gauge detail"
      aria-busy="true"
      className="flex animate-pulse flex-col gap-5 motion-reduce:animate-none"
    >
      <div className="h-4 w-16 rounded bg-inset" />
      <div className="flex gap-5 py-1">
        <div className="size-[88px] rounded-[20px] bg-inset" />
        <div className="flex flex-1 flex-col gap-3">
          <div className="h-8 w-64 rounded bg-inset" />
          <div className="h-4 w-full max-w-lg rounded bg-inset" />
          <div className="h-6 w-48 rounded bg-inset" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
        {["a", "b", "c", "d", "e"].map((key) => (
          <div key={key} className="h-[74px] rounded-[10px] bg-inset" />
        ))}
      </div>
      <div className="h-[92px] rounded-[10px] bg-inset" />
    </section>
  )
}
