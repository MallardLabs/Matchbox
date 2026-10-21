import { useConnectDialog } from "@/app/ConnectDialog"
import { useGaugeEpochHistory } from "@/features/history/useHistory"
import { useBoostGauges } from "@/hooks/useBoostGauges"
import { useGaugeWatchlist } from "@/hooks/useGaugeWatchlist"
import { useBtcPrice, useMezoPrice } from "@/hooks/usePrices"
import { profileForGauge, useGaugeProfiles } from "@/hooks/useProfiles"
import { useTopology } from "@/hooks/useTopology"
import { formatApyBasisPoints, formatBoost } from "@/lib/money"
import { useViewer } from "@/lib/viewer"
import * as Skeleton from "@repo/ui/skeleton"
import { shortenAddress } from "@repo/ui/wallet-address"
import { Link } from "@tanstack/react-router"
import { ArrowLeft } from "lucide-react"
import { type ReactElement, useEffect, useMemo, useState } from "react"
import { type Address, getAddress, isAddress } from "viem"
import AddIncentivesSheet from "./AddIncentivesSheet"
import GaugeIdentity from "./GaugeIdentity"
import {
  EpochIncentivesCard,
  type GaugeStat,
  GaugeStats,
  OptimalCard,
  RecentEpochsCard,
  STAT_GRID,
  statTileClass,
} from "./GaugeSections"
import {
  type EpochTableRow,
  epochIncentives,
  epochRowLabel,
  formatNative,
  gaugeApyBps,
  optimalFraction,
  recentEpochRows,
  usdLabel,
} from "./model"

function BackLink(): ReactElement {
  return (
    <Link
      to="/vote"
      className="relative inline-flex w-fit items-center gap-1.5 rounded text-body-sm font-500 text-muted transition-colors after:absolute after:-inset-x-2 after:-inset-y-3 after:content-[''] hover:text-ink"
    >
      <ArrowLeft aria-hidden="true" size={14} strokeWidth={1.75} />
      Vote
    </Link>
  )
}

export default function GaugeDetailPage({
  address: param,
}: { address: string }): ReactElement {
  const address = isAddress(param, { strict: false })
    ? getAddress(param)
    : undefined
  if (!address) return <GaugeMissing address={param} />
  return <GaugeDetail address={address} />
}

function GaugeDetail({ address }: { address: Address }): ReactElement {
  const { gauges, isLoading: gaugesLoading } = useBoostGauges()
  const profiles = useGaugeProfiles()
  const topology = useTopology()
  const { data: btcPrice = null } = useBtcPrice()
  const { data: mezoPrice = null, isLoading: mezoPriceLoading } = useMezoPrice()
  const { viewer } = useViewer()
  const { open: openConnect } = useConnectDialog()
  const { isWatching, toggleWatching } = useGaugeWatchlist()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [openAfterConnect, setOpenAfterConnect] = useState(false)

  // Add incentives while disconnected: connect first, then open the sheet.
  useEffect(() => {
    if (openAfterConnect && viewer.mode === "connected") {
      setOpenAfterConnect(false)
      setSheetOpen(true)
    }
  }, [openAfterConnect, viewer.mode])

  const gauge = gauges.find(
    (item) => item.address.toLowerCase() === address.toLowerCase(),
  )
  // Waits for the gauge so the first request already carries the veBTC token
  // id that history needs to read each sealed epoch's boost.
  const history = useGaugeEpochHistory(
    gauge ? address : undefined,
    8,
    gauge?.veBTCTokenId,
  )
  const profile = profileForGauge(profiles.data, address)
  const rewardTokens = topology.data?.gauges.find(
    (item) => item.gaugeAddress.toLowerCase() === address.toLowerCase(),
  )?.rewardTokens

  const incentives = useMemo(
    () =>
      rewardTokens
        ? epochIncentives(rewardTokens, {
            btcPriceUsd: btcPrice,
            mezoPriceUsd: mezoPrice,
          })
        : undefined,
    [btcPrice, mezoPrice, rewardTokens],
  )

  if ((gaugesLoading && !gauge) || profiles.isLoading)
    return <GaugeDetailSkeleton />
  if (!gauge) {
    return <GaugeMissing address={address} unavailable={gauges.length === 0} />
  }

  const displayName = profile?.display_name?.trim()
  const name = displayName ? displayName : shortenAddress(address)
  const tokenId = gauge.veBTCTokenId?.toString()
  const linked = gauge.veBTCTokenId !== undefined
  const incentivesLoading = topology.isLoading
  const incentivesUsd = incentives?.totalUsdMicro ?? null
  const apy = gaugeApyBps({
    incentivesUsdMicro: incentivesUsd,
    veMezo: gauge.totalWeight,
    mezoPriceUsd: mezoPrice,
  })
  const veMezo = formatNative(gauge.totalWeight, 18)
  const boost = linked ? formatBoost(gauge.boostMultiplier) : "—"
  const incentivesText = topology.isError
    ? "Unavailable"
    : usdLabel(incentivesUsd, incentives?.unpricedCount ?? 0)
  const apyText = formatApyBasisPoints(apy)

  const stats: GaugeStat[] = [
    {
      label: "veBTC",
      value:
        gauge.veBTCWeight === undefined
          ? "—"
          : formatNative(gauge.veBTCWeight, 18),
    },
    { label: "veMEZO", value: veMezo },
    { label: "Boost", value: boost },
    {
      label: "APY",
      value: apyText,
      ...(apy === null ? {} : { tone: "pos" as const }),
      loading: incentivesLoading || mezoPriceLoading,
    },
    { label: "Incentives", value: incentivesText, loading: incentivesLoading },
  ]

  const epochStart = Number(topology.data?.epochStart)
  const live: EpochTableRow | undefined = incentivesLoading
    ? undefined
    : {
        key: "live",
        label: epochRowLabel(
          Number.isFinite(epochStart) ? epochStart : undefined,
        ),
        current: true,
        veMezo,
        boost,
        incentives: incentivesText,
        apy: apyText,
        apyKnown: apy !== null,
      }

  function addIncentives(): void {
    if (viewer.mode === "disconnected") {
      setOpenAfterConnect(true)
      openConnect()
      return
    }
    setSheetOpen(true)
  }

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <BackLink />
      <GaugeIdentity
        address={address}
        name={name}
        profile={profile}
        tokenId={tokenId}
        isAlive={gauge.isAlive}
        watching={isWatching(address)}
        onToggleWatch={() => toggleWatching(address)}
        onAddIncentives={addIncentives}
      />
      <GaugeStats stats={stats} />
      <OptimalCard
        optimal={gauge.optimalVeMEZO}
        additional={gauge.optimalAdditionalVeMEZO}
        boost={linked ? gauge.boostMultiplier : undefined}
        fraction={optimalFraction(gauge.totalWeight, gauge.optimalVeMEZO)}
      />
      <EpochIncentivesCard
        incentives={incentives}
        loading={incentivesLoading}
        failed={topology.isError}
        onRetry={() => void topology.refetch()}
      />
      <RecentEpochsCard
        rows={recentEpochRows(
          history.status === "ready" ? history.data : undefined,
          live,
        )}
        status={history.status}
        stale={history.freshness?.state === "stale"}
      />
      <AddIncentivesSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        gauge={address}
        gaugeName={name}
        tokenId={tokenId}
      />
    </div>
  )
}

function GaugeMissing({
  address,
  unavailable = false,
}: {
  address: string
  unavailable?: boolean
}): ReactElement {
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <BackLink />
      <section className="flex max-w-xl flex-col gap-2 rounded-[10px] bg-surface p-4">
        <h1 className="m-0 text-metric font-400 text-ink">
          {unavailable ? "Gauges unavailable" : "Gauge not found"}
        </h1>
        <p className="m-0 break-all font-mono text-label text-muted">
          {address}
        </p>
        <Link
          to="/vote"
          className="relative mt-1 w-fit text-body-sm font-600 text-accent-ink underline-offset-2 after:absolute after:-inset-x-2 after:-inset-y-3 after:content-[''] hover:underline"
        >
          Back to Vote
        </Link>
      </section>
    </div>
  )
}

function GaugeDetailSkeleton(): ReactElement {
  return (
    <div
      aria-busy="true"
      aria-label="Loading gauge"
      className="flex min-w-0 flex-col gap-5"
    >
      <BackLink />
      <div className="flex flex-col gap-5 py-1 md:flex-row md:items-start">
        <div className="flex flex-1 items-start gap-4 md:gap-5">
          <Skeleton.Root className="size-16 shrink-0 rounded-2xl md:size-[88px] md:rounded-[20px]" />
          <div className="flex flex-1 flex-col gap-3 pt-1">
            <Skeleton.Root className="h-7 w-56 max-w-full" />
            <Skeleton.Root className="h-3.5 w-full max-w-md" />
            <Skeleton.Root className="h-6 w-48" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 md:flex md:flex-col">
          <Skeleton.Root className="h-9 rounded-[7px] md:w-[148px]" />
          <Skeleton.Root className="h-9 rounded-[7px] md:w-[148px]" />
          <Skeleton.Root className="col-span-2 h-9 rounded-[7px] md:w-[148px]" />
        </div>
      </div>
      <div className={STAT_GRID}>
        {["a", "b", "c", "d", "e"].map((key, index) => (
          <div key={key} className={statTileClass(index, 5)}>
            <Skeleton.Root className="bg-inset-2 h-2.5 w-12" />
            <Skeleton.Root className="bg-inset-2 h-5 w-20" />
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-3 rounded-[10px] bg-surface p-4">
        <Skeleton.Root className="bg-inset-2 h-3.5 w-28" />
        <Skeleton.Root className="bg-inset-2 h-2 w-full" />
      </div>
      <div className="flex flex-col gap-3 rounded-[10px] bg-surface p-4">
        <Skeleton.Root className="bg-inset-2 h-4 w-24" />
        <Skeleton.Root className="bg-inset-2 h-3.5 w-full" />
        <Skeleton.Root className="bg-inset-2 h-3.5 w-full" />
      </div>
    </div>
  )
}
