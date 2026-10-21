import { useConnectDialog } from "@/app/ConnectDialog"
import {
  type Totals,
  useHistoryNetwork,
  useWalletEarnings,
  useWalletLedger,
  walletLedgerCsvUrl,
} from "@/features/history/useHistory"
import { useVeMEZOLocks } from "@/hooks/useLocks"
import { usePersonalProjected } from "@/hooks/usePersonalProjected"
import { profileForGauge, useGaugeProfiles } from "@/hooks/useProfiles"
import { useRewardClaims } from "@/hooks/useRewardClaims"
import { formatMicroUsd } from "@/lib/money"
import { useNetwork } from "@/lib/network"
import { type Viewer, useViewer } from "@/lib/viewer"
import * as Button from "@repo/ui/button"
import * as EmptyState from "@repo/ui/empty-state"
import { useQueryClient } from "@tanstack/react-query"
import { LoaderCircle } from "lucide-react"
import { type ReactElement, type ReactNode, useMemo, useState } from "react"
import ClaimPanel from "./ClaimPanel"
import ClaimSheet from "./ClaimSheet"
import EpochLedger from "./EpochLedger"
import RealizedChart from "./RealizedChart"
import ToggleChip from "./ToggleChip"
import TotalsStrip, { type TotalItem } from "./TotalsStrip"
import { formatTokenList, signatureNote, sourceTokens } from "./claimSources"
import { csvFilename, downloadCsv, toCsv } from "./csv"
import {
  CHART_EPOCHS,
  LEDGER_CSV_HEADERS,
  PERIODS,
  type PeriodId,
  emptyBars,
  epochStartOf,
  formatEpochDate,
  ledgerCsvRows,
  periodFrom,
  realizedBars,
} from "./ledgerModel"
import { useClaimEstimate, useClaimRun } from "./useClaimRun"
import { useClaimSources } from "./useClaimSources"

export default function RewardsPage(): ReactElement {
  const { viewer } = useViewer()
  if (viewer.mode === "disconnected") return <Disconnected />
  return <RewardsWallet key={viewer.address} viewer={viewer} />
}

function PageTitle({ children }: { children?: ReactNode }): ReactElement {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-col gap-1.5">
        <p className="text-label text-muted md:hidden xl:block">
          Voting incentives only
        </p>
        <h1 className="text-[22px] font-600 leading-7 text-ink md:text-[26px] md:leading-8 xl:text-title">
          Rewards
        </h1>
      </div>
      {children}
    </header>
  )
}

function Disconnected(): ReactElement {
  const { open } = useConnectDialog()
  return (
    <div className="flex flex-col gap-4 xl:gap-6">
      <PageTitle />
      <EmptyState.Root>
        <EmptyState.Title>No wallet connected</EmptyState.Title>
        <EmptyState.Action>
          <Button.Root size="md" onClick={open}>
            Connect wallet
          </Button.Root>
        </EmptyState.Action>
      </EmptyState.Root>
    </div>
  )
}

/** USD at earn for a totals bucket; "≥" when some token lines are unpriced. */
function totalValue(
  ready: boolean,
  totals: Totals | undefined,
  format: (micro: bigint) => string = formatMicroUsd,
): string {
  if (!ready || !totals) return "—"
  if (totals.usdAtEarnMicro === null) {
    return totals.tokens.length > 0 ? "Unpriced" : format(0n)
  }
  return `${totals.unpriced > 0 ? "≥ " : ""}${format(totals.usdAtEarnMicro)}`
}

/** "$12,480" from $1,000, cents below. */
function summaryUsd(micro: bigint): string {
  if (micro < 1_000_000_000n) return formatMicroUsd(micro)
  return formatMicroUsd(micro).replace(/\.\d{2}$/, "")
}

function RewardsWallet({
  viewer,
}: {
  viewer: Exclude<Viewer, { mode: "disconnected" }>
}): ReactElement {
  const address = viewer.address
  const { switchWalletToApp, isSwitching } = useNetwork()
  const network = useHistoryNetwork()
  const [now] = useState(() => Math.floor(Date.now() / 1000))
  const [period, setPeriod] = useState<PeriodId>("last-8")
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(new Set())
  const [sheetOpen, setSheetOpen] = useState(false)

  const claim = useClaimSources()
  const locks = useVeMEZOLocks()
  const tokenIds = useMemo(
    () => locks.locks.map((lock) => lock.tokenId),
    [locks.locks],
  )
  const projection = usePersonalProjected(tokenIds)
  const receipts = useRewardClaims()
  const run = useClaimRun()
  const { data: profiles } = useGaugeProfiles()
  const queryClient = useQueryClient()

  const earnings = useWalletEarnings(address, CHART_EPOCHS)
  const from = periodFrom(period, now)
  const ledger = useWalletLedger(address, { from, limit: 500 })

  const selected = claim.sources.filter((source) => !excluded.has(source.key))
  const selectedKeys = new Set(selected.map((source) => source.key))
  const estimate = useClaimEstimate(address, selected)
  const failedSimulation = new Set(estimate.data?.failed ?? [])

  const selectedMicro = selected.reduce(
    (sum, source) => sum + source.usdMicro,
    0n,
  )
  const selectedUnpriced = selected.some((source) => source.unpriced > 0)

  const gaugeName = (gauge: string): string | null =>
    profileForGauge(profiles, gauge)?.display_name ?? null

  // Projected current epoch: the history endpoint when live, else the live
  // vote-share projection the Overview uses.
  const earningsReady = earnings.status === "ready" && !!earnings.data
  const projectedMicro = earningsReady
    ? (earnings.data?.current.usdNowMicro ?? null)
    : projection.mezoPrice && !projection.isLoading && !projection.error
      ? projection.projectedMicro
      : null
  const currentStart = earnings.data?.current.epochStart ?? epochStartOf(now)

  const bars =
    earningsReady && earnings.data
      ? realizedBars(earnings.data.epochs, projectedMicro)
      : emptyBars(now)
  const chartState =
    earnings.status === "loading"
      ? "Loading"
      : earnings.status === "ready"
        ? earnings.freshness?.state === "stale"
          ? "Stale"
          : null
        : "Unavailable"

  const unpricedTokens = new Set<string>()
  for (const token of claim.tokens) {
    if (token.usdMicro === null) unpricedTokens.add(token.token.toLowerCase())
  }
  for (const row of ledger.data ?? []) {
    if (row.usdNowMicro === null) unpricedTokens.add(row.token.toLowerCase())
  }

  const totals = earnings.data?.totals
  const totalItems: TotalItem[] = [
    {
      label: "Lifetime realized",
      value: totalValue(earningsReady, totals?.realized),
      qualifier: earningsReady ? "USD at earn time" : "Unavailable",
    },
    {
      label: "Claimed",
      value: totalValue(earningsReady, totals?.claimed),
      qualifier: earningsReady ? "moved to wallet" : "Unavailable",
    },
    {
      label: "Pending / projected",
      value: projectedMicro === null ? "—" : formatMicroUsd(projectedMicro),
      qualifier: `not realized · ${formatEpochDate(currentStart)}`,
    },
    {
      label: "Unpriced tokens",
      value: unpricedTokens.size === 0 ? "None" : String(unpricedTokens.size),
      qualifier: "not in USD totals",
    },
  ]
  const summary = [
    `Lifetime realized ${totalValue(earningsReady, totals?.realized, summaryUsd)}`,
    `Pending ${projectedMicro === null ? "—" : summaryUsd(projectedMicro)} not realized`,
  ].join(" · ")

  // Claim action and the line under the amount.
  const running = run.phase === "running"
  let action: ReactNode
  let note: ReactNode = null
  let noteTone: "accent" | "muted" | "warn" = "accent"
  if (viewer.mode === "watching") {
    action = <ClaimButton disabled>Claim all</ClaimButton>
    note = "Connect this wallet to claim"
    noteTone = "muted"
  } else if (viewer.wrongNetwork) {
    action = (
      <ClaimButton
        loading={isSwitching}
        onClick={() => void switchWalletToApp()}
      >
        Switch network
      </ClaimButton>
    )
    note = "Wrong network"
    noteTone = "warn"
  } else if (running) {
    action = (
      <ClaimButton aria-busy onClick={() => setSheetOpen(true)}>
        <LoaderCircle
          aria-hidden="true"
          size={13}
          strokeWidth={2}
          className="animate-spin motion-reduce:animate-none"
        />
        Claiming
      </ClaimButton>
    )
  } else if (receipts.pending) {
    action = <ClaimButton loading>Confirming</ClaimButton>
  } else if (claim.status === "error") {
    action = (
      <Button.Root variant="secondary" size="md" onClick={claim.refetch}>
        Retry
      </Button.Root>
    )
    note = "Unavailable"
    noteTone = "warn"
  } else {
    action = (
      <ClaimButton
        disabled={
          claim.status !== "ready" || claim.isFetching || selected.length === 0
        }
        onClick={() => {
          run.start(selected)
          setSheetOpen(true)
        }}
      >
        {selected.length < claim.sources.length
          ? "Claim selected"
          : "Claim all"}
      </ClaimButton>
    )
  }
  if (note === null && claim.status === "ready") {
    if (claim.sources.length === 0) {
      note = "Nothing to claim"
      noteTone = "muted"
    } else {
      note = signatureNote(selected.length, estimate.data?.gasWei ?? null)
      if (claim.incomplete) {
        note = `${note ?? "No sources selected"} · some reads failed`
        noteTone = "warn"
      } else if (note === null) {
        note = "No sources selected"
        noteTone = "muted"
      }
    }
  }

  function exportCsv(): void {
    const rows = ledger.data ?? []
    const filename = csvFilename("rewards", address, new Date())
    if (ledger.hasNextPage) {
      const link = document.createElement("a")
      link.href = walletLedgerCsvUrl(address, { from }, network)
      link.download = filename
      link.click()
      return
    }
    downloadCsv(
      filename,
      toCsv(LEDGER_CSV_HEADERS, ledgerCsvRows(rows, gaugeName)),
    )
  }

  return (
    <div className="flex flex-col gap-3 md:gap-4 xl:gap-6">
      <PageTitle>
        <div className="hidden flex-wrap items-center gap-2 md:flex">
          <fieldset className="m-0 flex min-w-0 items-center gap-2 border-0 p-0">
            <legend className="sr-only">Ledger period</legend>
            {PERIODS.map((item) => (
              <ToggleChip
                key={item.id}
                pressed={period === item.id}
                onClick={() => setPeriod(item.id)}
              >
                {item.label}
              </ToggleChip>
            ))}
          </fieldset>
          <Button.Root
            variant="secondary"
            size="sm"
            className="h-8 px-3 font-500"
            disabled={
              ledger.status !== "ready" || (ledger.data?.length ?? 0) === 0
            }
            onClick={exportCsv}
          >
            Export CSV
          </Button.Root>
        </div>
      </PageTitle>

      <div className="flex flex-col gap-10 xl:min-h-[340px] xl:flex-row">
        <div className="min-w-0 flex-1">
          <ClaimPanel
            status={claim.status}
            sources={claim.sources}
            selected={selectedKeys}
            onToggle={(key, checked) =>
              setExcluded((current) => {
                const next = new Set(current)
                if (checked) next.delete(key)
                else next.add(key)
                return next
              })
            }
            totalMicro={selectedMicro}
            lowerBound={selectedUnpriced || claim.incomplete}
            natives={formatTokenList(sourceTokens(selected))}
            note={note}
            noteTone={noteTone}
            failedSimulation={failedSimulation}
            action={action}
          />
        </div>
        <div className="hidden xl:flex">
          <RealizedChart bars={bars} state={chartState} />
        </div>
      </div>

      <div className="hidden xl:block">
        <TotalsStrip items={totalItems} />
      </div>
      <p className="text-label text-secondary tabular-nums xl:hidden">
        {summary}
      </p>

      <EpochLedger
        status={ledger.status}
        rows={ledger.data ?? []}
        gaugeName={gaugeName}
        epochLabel={formatEpochDate}
        hasMore={ledger.hasNextPage}
        loadingMore={ledger.isFetchingNextPage}
        onLoadMore={ledger.fetchNextPage}
        onRetry={() => {
          void queryClient.invalidateQueries({ queryKey: ["history"] })
        }}
      />

      {run.run && run.phase ? (
        <ClaimSheet
          open={sheetOpen}
          sources={run.run.sources}
          steps={run.run.steps}
          phase={run.phase}
          explorer={receipts.explorer}
          onRetry={run.retry}
          onOpenChange={(open) => {
            setSheetOpen(open)
            if (!open && run.phase !== "running") {
              run.close()
              setExcluded(new Set())
            }
          }}
        />
      ) : null}
    </div>
  )
}

function ClaimButton({ children, ...props }: Button.ButtonProps): ReactElement {
  return (
    <Button.Root
      size="md"
      className="h-9 px-3.5 text-body-sm font-600"
      {...props}
    >
      {children}
    </Button.Root>
  )
}
