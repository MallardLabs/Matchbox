import { useConnectDialog } from "@/app/ConnectDialog"
import { useGaugeWatchlist } from "@/hooks/useGaugeWatchlist"
import {
  DESKTOP_QUERY,
  TABLET_UP_QUERY,
  useMediaQuery,
} from "@/hooks/useMediaQuery"
import { useBtcPrice, useMezoPrice } from "@/hooks/usePrices"
import { priceToMicroUsd } from "@/lib/money"
import { useNetwork } from "@/lib/network"
import { calculateAnnualizedReturnBasisPoints } from "@/lib/rewardOptimizer"
import { useViewer } from "@/lib/viewer"
import * as Button from "@repo/ui/button"
import { cn } from "@repo/ui/cn"
import * as EmptyState from "@repo/ui/empty-state"
import * as Toast from "@repo/ui/toast"
import { shortenAddress } from "@repo/ui/wallet-address"
import {
  type ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { useAccount } from "wagmi"
import AllocationDiff from "./AllocationDiff"
import BallotBar from "./BallotBar"
import BallotPanel, { type BallotModel, type PanelAction } from "./BallotPanel"
import BallotSheet from "./BallotSheet"
import CheckoutSheet, { type CheckoutSummary } from "./CheckoutSheet"
import LockSelector from "./LockSelector"
import Pagination from "./Pagination"
import TargetCard from "./TargetCard"
import TargetFilters from "./TargetFilters"
import TargetRow from "./TargetRow"
import {
  type Ballot,
  FULL_BALLOT_BPS,
  addToBallot,
  ballotTotal,
  entryBps,
  formatBps,
  hasEntry,
  isBallotComplete,
  removeFromBallot,
  setEntryBps,
  stepEntry,
  weightedEntries,
} from "./ballot"
import { MAX_VOTING_TARGETS } from "./contracts"
import type { VotingWindow } from "./locks"
import { VOTE_TYPE_META, type VoteTarget, type VoteType } from "./model"
import {
  type AllocationSnapshot,
  optimizeBallot,
  toOptimizerTargets,
} from "./optimize"
import {
  diffAllocations,
  isMaterialChange,
  projectedChangeBps,
} from "./presign"
import { projectTarget, sumNative, voteWeightForBps } from "./projection"
import type { VoteView } from "./search"
import type { Prices } from "./targets"
import { useBallotStore } from "./useBallotStore"
import { usePoolTargets } from "./usePoolTargets"
import { useValidatorTargets } from "./useValidatorTargets"
import { useVeMezoTargets } from "./useVeMezoTargets"
import { type CheckoutLock, useVoteCheckout } from "./useVoteCheckout"
import { useOwnVotes, useVoteLocks } from "./useVoteLocks"

const PAGE_SIZE = 10

type TargetData = {
  targets: VoteTarget[]
  isLoading: boolean
  incentivesLoading: boolean
}

export type WorkspaceProps = {
  view: VoteView
  optimizeRequested: boolean
  /** Target address from gauge detail's "Add to ballot". */
  addRequested: string | null
  onViewChange: (patch: Partial<VoteView>) => void
  onActionHandled: (action: "optimize" | "add") => void
}

function usePriceSnapshot(): {
  prices: Prices
  ready: boolean
  degraded: boolean
} {
  const btc = useBtcPrice()
  const mezo = useMezoPrice()
  const btcPrice = btc.data ?? null
  const mezoPrice = mezo.data ?? null
  const prices = useMemo(
    () => ({ btc: btcPrice, mezo: mezoPrice }),
    [btcPrice, mezoPrice],
  )
  return {
    prices,
    ready: !btc.isLoading && !mezo.isLoading,
    degraded: (!btc.isLoading && !btcPrice) || (!mezo.isLoading && !mezoPrice),
  }
}

/** Picks the branch's data source; each branch reads only its own voter. */
export default function VoteWorkspace(props: WorkspaceProps): ReactElement {
  if (props.view.type === "validators") return <ValidatorWorkspace {...props} />
  if (props.view.type === "pools") return <PoolWorkspace {...props} />
  return <VeMezoWorkspace {...props} />
}

function VeMezoWorkspace(props: WorkspaceProps): ReactElement {
  const pricing = usePriceSnapshot()
  const data = useVeMezoTargets(pricing.prices)
  return <Workspace {...props} type="vemezo" data={data} pricing={pricing} />
}

function ValidatorWorkspace(props: WorkspaceProps): ReactElement {
  const pricing = usePriceSnapshot()
  const data = useValidatorTargets(pricing.prices)
  return (
    <Workspace {...props} type="validators" data={data} pricing={pricing} />
  )
}

function PoolWorkspace(props: WorkspaceProps): ReactElement {
  const pricing = usePriceSnapshot()
  const data = usePoolTargets(pricing.prices)
  return <Workspace {...props} type="pools" data={data} pricing={pricing} />
}

function compareDesc(a: bigint, b: bigint): number {
  if (a === b) return 0
  return a > b ? -1 : 1
}

function windowLabel(window: VotingWindow): string | null {
  if (window === "opens-soon") return "Voting opens 01:00 UTC"
  if (window === "closing") return "Voting closed"
  return null
}

type DiffState = {
  was: AllocationSnapshot
  now: AllocationSnapshot
  ballot: Ballot
}

function Workspace({
  type,
  data,
  pricing,
  view,
  optimizeRequested,
  addRequested,
  onViewChange,
  onActionHandled,
}: WorkspaceProps & {
  type: VoteType
  data: TargetData
  pricing: { prices: Prices; ready: boolean; degraded: boolean }
}): ReactElement {
  const meta = VOTE_TYPE_META[type]
  const { viewer } = useViewer()
  // Wallets reconnect after first paint; don't treat that as disconnected.
  const { status: accountStatus } = useAccount()
  const { chainId, switchWalletToApp, isSwitching } = useNetwork()
  const { open: openConnect } = useConnectDialog()
  const { toast } = Toast.useToast()
  const desktop = useMediaQuery(DESKTOP_QUERY)
  const tabletUp = useMediaQuery(TABLET_UP_QUERY)
  const watchlist = useGaugeWatchlist()
  const watched = watchlist.watchedGaugeAddresses
  const lockData = useVoteLocks(type)
  const [store, update] = useBallotStore(chainId, viewer.address, type)
  const [highlightId, setHighlightId] = useState<string | null>(null)
  const [ballotSheetOpen, setBallotSheetOpen] = useState(false)
  const [diff, setDiff] = useState<DiffState | null>(null)
  const [signed, setSigned] = useState<{
    summary: CheckoutSummary
    locks: CheckoutLock[]
    entries: Ballot
  } | null>(null)
  const checkout = useVoteCheckout(type, meta)
  const assetPrice =
    meta.asset === "veBTC" ? pricing.prices.btc : pricing.prices.mezo
  const assetPriceMicroUsd = assetPrice ? priceToMicroUsd(assetPrice) : 0n

  // Locks: every votable lock unless the viewer picked some.
  const votable = useMemo(
    () => lockData.locks.filter((lock) => lock.state === "votable"),
    [lockData.locks],
  )
  const selectedLocks = useMemo(() => {
    if (store.picked === null) return votable
    const picked = new Set(store.picked)
    return votable.filter((lock) => picked.has(lock.tokenId.toString()))
  }, [store.picked, votable])
  const selectedIds = useMemo(
    () => new Set(selectedLocks.map((lock) => lock.tokenId.toString())),
    [selectedLocks],
  )
  const selectedTokenIds = useMemo(
    () => selectedLocks.map((lock) => lock.tokenId),
    [selectedLocks],
  )
  const powers = useMemo(
    () => selectedLocks.map((lock) => lock.votingPower),
    [selectedLocks],
  )
  const selectedPower = powers.reduce((total, power) => total + power, 0n)
  const ownVotes = useOwnVotes(type, selectedTokenIds)

  const optimizerTargets = useMemo(
    () =>
      toOptimizerTargets(
        data.targets.map((target) => ({
          id: target.id,
          isAlive: target.isAlive,
          totalWeight: target.totalWeight,
          incentiveMicroUsd: target.incentiveMicroUsd,
          rewards: target.rewards,
        })),
        ownVotes.ownWeights,
      ),
    [data.targets, ownVotes.ownWeights],
  )
  const targetById = useMemo(
    () =>
      new Map(data.targets.map((target) => [target.id.toLowerCase(), target])),
    [data.targets],
  )
  const optimizerById = useMemo(
    () =>
      new Map(
        optimizerTargets.map((target) => [target.id.toLowerCase(), target]),
      ),
    [optimizerTargets],
  )

  // Ballot projection: each slice against competing votes that remain after
  // the selected locks' standing votes are replaced.
  const model = useMemo((): BallotModel => {
    const rows = store.ballot.map((entry) => {
      const target = targetById.get(entry.id.toLowerCase())
      const projectionTarget = optimizerById.get(entry.id.toLowerCase())
      const weight = voteWeightForBps(powers, entry.bps)
      const projection = projectionTarget
        ? projectTarget(projectionTarget, weight)
        : null
      return {
        row: {
          id: entry.id,
          name: target?.name ?? shortenAddress(entry.id),
          bps: entry.bps,
          apyBps:
            projection && weight > 0n
              ? calculateAnnualizedReturnBasisPoints({
                  epochRewardMicroUsd: projection.microUsd,
                  votingPowers: [weight],
                  assetPriceMicroUsd,
                })
              : null,
          projectedMicroUsd: projection?.microUsd ?? 0n,
          hasUnpriced: projection?.hasUnpriced ?? false,
        },
        native: projection?.native ?? [],
      }
    })
    const projectedMicroUsd = rows.reduce(
      (total, item) => total + item.row.projectedMicroUsd,
      0n,
    )
    return {
      rows: rows.map((item) => item.row),
      totalBps: ballotTotal(store.ballot),
      complete: isBallotComplete(store.ballot),
      projectedMicroUsd,
      native: sumNative(rows.map((item) => item.native)),
      hasUnpriced: rows.some(
        (item) => item.row.bps > 0 && item.row.hasUnpriced,
      ),
      apyBps: calculateAnnualizedReturnBasisPoints({
        epochRewardMicroUsd: projectedMicroUsd,
        votingPowers: powers,
        assetPriceMicroUsd,
      }),
      weightedCount: weightedEntries(store.ballot).length,
    }
  }, [assetPriceMicroUsd, optimizerById, powers, store.ballot, targetById])

  // Filter, sort, page.
  const filtered = useMemo(() => {
    const needle = view.query.trim().toLowerCase()
    return data.targets
      .filter((target) => {
        if (view.status === "active" && !target.isAlive) return false
        if (view.status === "watching" && !watched.has(target.id.toLowerCase()))
          return false
        if (type === "vemezo" && view.needsBoost && !target.needsBoost)
          return false
        return needle === "" || target.searchText.includes(needle)
      })
      .sort((a, b) => {
        const primary = compareDesc(
          a.sortValues[view.sort] ?? a.sortValues.apy ?? 0n,
          b.sortValues[view.sort] ?? b.sortValues.apy ?? 0n,
        )
        if (primary !== 0) return primary
        const incentives = compareDesc(a.incentiveMicroUsd, b.incentiveMicroUsd)
        if (incentives !== 0) return incentives
        const weight = compareDesc(a.totalWeight, b.totalWeight)
        if (weight !== 0) return weight
        return a.name.localeCompare(b.name)
      })
  }, [data.targets, type, view, watched])
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const page = Math.min(view.page, pageCount - 1)
  const visible = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  // Ballot edits. Any manual change marks the ballot edited so a pre-sign
  // refresh will never overwrite it.
  const editBallot = useCallback(
    (fn: (ballot: Ballot) => Ballot, touched: string | null) => {
      update((previous) => ({
        ...previous,
        ballot: fn(previous.ballot),
        edited: previous.optimum !== null,
      }))
      setHighlightId(touched)
    },
    [update],
  )

  function addBlockedReason(target: VoteTarget): string | null {
    if (!target.isAlive) return "Inactive"
    if (store.ballot.length >= MAX_VOTING_TARGETS)
      return `${MAX_VOTING_TARGETS} targets max`
    return null
  }

  function toggleBallot(target: VoteTarget): void {
    if (hasEntry(store.ballot, target.id)) {
      editBallot((ballot) => removeFromBallot(ballot, target.id), null)
      return
    }
    if (addBlockedReason(target) !== null) return
    editBallot((ballot) => addToBallot(ballot, target.id), target.id)
  }

  const canOptimize =
    viewer.mode !== "disconnected" &&
    selectedLocks.length > 0 &&
    !data.isLoading &&
    !data.incentivesLoading &&
    !ownVotes.isLoading &&
    pricing.ready &&
    !pricing.degraded

  const optimize = useCallback(() => {
    const result = optimizeBallot(optimizerTargets, powers)
    if (!result) {
      toast({ title: `No incentivised ${meta.targetNoun}`, tone: "neutral" })
      return
    }
    update((previous) => ({
      ...previous,
      ballot: result.ballot,
      optimum: result.snapshot,
      edited: false,
    }))
    setHighlightId(null)
  }, [meta.targetNoun, optimizerTargets, powers, toast, update])

  // `/vote?optimize=1` from the search palette.
  useEffect(() => {
    if (!optimizeRequested || accountStatus === "reconnecting") return
    if (accountStatus === "connecting") return
    if (viewer.mode === "disconnected") {
      onActionHandled("optimize")
      openConnect()
      return
    }
    if (!canOptimize) return
    optimize()
    onActionHandled("optimize")
  }, [
    accountStatus,
    canOptimize,
    onActionHandled,
    openConnect,
    optimize,
    optimizeRequested,
    viewer.mode,
  ])

  // `/vote?add=0x…` from gauge detail.
  useEffect(() => {
    if (addRequested === null || data.isLoading) return
    const target = targetById.get(addRequested.toLowerCase())
    if (
      target?.isAlive &&
      !hasEntry(store.ballot, target.id) &&
      store.ballot.length < MAX_VOTING_TARGETS
    )
      editBallot((ballot) => addToBallot(ballot, target.id), target.id)
    onActionHandled("add")
  }, [
    addRequested,
    data.isLoading,
    editBallot,
    onActionHandled,
    store.ballot,
    targetById,
  ])

  const optimizeAction: PanelAction = {
    label: pricing.degraded ? "Prices unavailable" : meta.optimizeLabel,
    disabled: !canOptimize,
    onPress: optimize,
  }

  // The one primary action, by state: connect, read-only, switch network,
  // lock and window rules, then the 100% rule.
  const weighted = weightedEntries(store.ballot)
  const deadOnBallot = weighted.some(
    (entry) => targetById.get(entry.id.toLowerCase())?.isAlive === false,
  )
  const blockedWindow = windowLabel(lockData.window)
  const voteReady =
    viewer.mode === "connected" &&
    viewer.canSign &&
    !lockData.isLoading &&
    selectedLocks.length > 0 &&
    blockedWindow === null &&
    model.complete &&
    !deadOnBallot

  function primaryAction(reviewLabel: string): PanelAction {
    const disabled = (label: string): PanelAction => ({
      label,
      disabled: true,
      onPress: () => undefined,
    })
    if (viewer.mode === "disconnected")
      return { label: "Connect to vote", disabled: false, onPress: openConnect }
    if (viewer.mode === "watching") return disabled("Watching · read-only")
    if (viewer.wrongNetwork)
      return {
        label: "Switch network",
        disabled: isSwitching,
        onPress: () => void switchWalletToApp(),
      }
    if (lockData.isLoading) return disabled(reviewLabel)
    if (votable.length === 0) return disabled("No votable locks")
    if (selectedLocks.length === 0) return disabled("Select a lock")
    if (blockedWindow) return disabled(blockedWindow)
    if (weighted.length === 0) return disabled(reviewLabel)
    if (deadOnBallot) return disabled("Remove inactive targets")
    if (model.totalBps < FULL_BALLOT_BPS)
      return disabled(
        `Allocate ${formatBps(FULL_BALLOT_BPS - model.totalBps)} more`,
      )
    if (model.totalBps > FULL_BALLOT_BPS)
      return disabled(`Remove ${formatBps(model.totalBps - FULL_BALLOT_BPS)}`)
    return {
      label: reviewLabel,
      disabled: !voteReady,
      onPress: () => {
        setBallotSheetOpen(false)
        setDiff(null)
        setSigned(null)
        checkout.openReview()
      },
    }
  }

  // Pre-sign refresh: re-run the optimizer on the fresh snapshot. Quiet when
  // the change is immaterial; otherwise ask, and never overwrite manual edits.
  const handledRefresh = useRef(0)
  useEffect(() => {
    if (!checkout.open || checkout.refresh !== "done") return
    if (checkout.refreshToken === handledRefresh.current) return
    if (data.isLoading || ownVotes.isLoading) return
    handledRefresh.current = checkout.refreshToken
    const optimum = store.optimum
    if (!optimum) return
    const fresh = optimizeBallot(optimizerTargets, powers)
    if (!fresh) return
    if (!isMaterialChange(optimum, fresh.snapshot)) {
      if (!store.edited)
        update((previous) => ({
          ...previous,
          ballot: fresh.ballot,
          optimum: fresh.snapshot,
        }))
      return
    }
    setDiff({ was: optimum, now: fresh.snapshot, ballot: fresh.ballot })
  }, [
    checkout.open,
    checkout.refresh,
    checkout.refreshToken,
    data.isLoading,
    optimizerTargets,
    ownVotes.isLoading,
    powers,
    store.edited,
    store.optimum,
    update,
  ])

  const liveSummary: CheckoutSummary = {
    rows: model.rows.filter((row) => row.bps > 0),
    projectedMicroUsd: model.projectedMicroUsd,
    native: model.native,
    apyBps: model.apyBps,
  }
  const checkoutLocks: CheckoutLock[] = signed?.locks ?? selectedLocks
  const checkoutEntries = signed?.entries ?? weighted
  const previewSteps = checkoutLocks.map((lock) => ({
    id: lock.tokenId.toString(),
    label: meta.stepLabel(lock.tokenId),
    status: "queued" as const,
  }))

  function sign(): void {
    const locks = selectedLocks.map((lock) => ({
      tokenId: lock.tokenId,
      votingPower: lock.votingPower,
    }))
    setSigned({ summary: liveSummary, locks, entries: weighted })
    checkout.sign(locks, weighted)
  }

  const showFigures = viewer.mode !== "disconnected"
  const primary = primaryAction(meta.signLabel)
  const barPrimary = primaryAction("Review vote")
  const searchLabel =
    type === "vemezo"
      ? tabletUp
        ? "Search gauges or providers"
        : "Search gauges"
      : type === "validators"
        ? "Search validators"
        : "Search pools and vaults"

  function lockToggle(tokenId: string): void {
    update((previous) => {
      const current =
        previous.picked === null
          ? votable.map((lock) => lock.tokenId.toString())
          : previous.picked
      const next = current.includes(tokenId)
        ? current.filter((id) => id !== tokenId)
        : [...current, tokenId]
      return { ...previous, picked: next }
    })
  }

  function selectAll(): void {
    const all =
      votable.length > 0 &&
      votable.every((lock) => selectedIds.has(lock.tokenId.toString()))
    update((previous) => ({ ...previous, picked: all ? [] : null }))
  }

  const diffNode = diff ? (
    <AllocationDiff
      rows={diffAllocations(diff.was, diff.now).map((row) => ({
        ...row,
        name:
          targetById.get(row.id.toLowerCase())?.name ?? shortenAddress(row.id),
      }))}
      was={diff.was}
      now={diff.now}
      changeBps={projectedChangeBps(diff.was, diff.now)}
      blockNumber={checkout.blockNumber}
      edited={store.edited}
      onAcknowledge={() => {
        update((previous) => ({
          ...previous,
          ballot: diff.ballot,
          optimum: diff.now,
          edited: false,
        }))
        setDiff(null)
      }}
      onKeep={() => {
        update((previous) => ({ ...previous, optimum: diff.now, edited: true }))
        setDiff(null)
      }}
    />
  ) : null

  const lockCount = checkoutLocks.length
  const signLabel = lockCount === 1 ? "Sign vote" : `Sign ${lockCount} votes`

  return (
    <>
      <LockSelector
        asset={meta.asset}
        mode={viewer.mode}
        isLoading={lockData.isLoading}
        locks={lockData.locks}
        selected={selectedIds}
        selectedPower={selectedPower}
        onToggle={lockToggle}
        onSelectAll={selectAll}
        onConnect={openConnect}
      />

      <div className="flex flex-col gap-8 xl:flex-row xl:items-start">
        <section
          aria-label={meta.targetNoun}
          aria-busy={data.isLoading || undefined}
          className={cn(
            "flex min-w-0 flex-1 flex-col",
            view.density === "compact" ? "gap-3" : "gap-5",
          )}
        >
          <TargetFilters
            query={view.query}
            status={view.status}
            needsBoost={view.needsBoost}
            showNeedsBoost={type === "vemezo"}
            sort={
              meta.sorts.some((option) => option.key === view.sort)
                ? view.sort
                : "apy"
            }
            sorts={meta.sorts}
            density={view.density}
            searchLabel={searchLabel}
            onQueryChange={(query) => onViewChange({ query, page: 0 })}
            onStatusChange={(status) => onViewChange({ status, page: 0 })}
            onNeedsBoostChange={(needsBoost) =>
              onViewChange({ needsBoost, page: 0 })
            }
            onSortChange={(sort) => onViewChange({ sort, page: 0 })}
            onDensityChange={(density) => onViewChange({ density })}
          />
          <TargetList
            loading={data.isLoading}
            targets={visible}
            tabletUp={tabletUp}
            view={view}
            perUnitLabel={meta.perUnitLabel}
            ballot={store.ballot}
            isWatching={watchlist.isWatching}
            addBlockedReason={addBlockedReason}
            onToggleBallot={toggleBallot}
            onToggleWatch={(target) => watchlist.toggleWatching(target.id)}
            onShareChange={(target, bps) =>
              editBallot(
                (ballot) => setEntryBps(ballot, target.id, bps),
                target.id,
              )
            }
            onClearFilters={() =>
              onViewChange({
                query: "",
                status: "all",
                needsBoost: false,
                page: 0,
              })
            }
          />
          {data.isLoading ? null : (
            <Pagination
              page={page}
              pageCount={pageCount}
              label={`${meta.targetNoun} pages`}
              onPageChange={(next) => onViewChange({ page: next })}
            />
          )}
        </section>

        {desktop ? (
          <aside
            aria-label={meta.ballotLabel}
            className="sticky top-24 w-[300px] shrink-0 2xl:w-[320px]"
          >
            <BallotPanel
              title={meta.ballotLabel}
              model={model}
              showFigures={showFigures}
              optimize={optimizeAction}
              primary={primary}
              highlightId={highlightId}
              onStep={(id, direction) =>
                editBallot((ballot) => stepEntry(ballot, id, direction), id)
              }
              onRemove={(id) =>
                editBallot((ballot) => removeFromBallot(ballot, id), null)
              }
            />
          </aside>
        ) : null}
      </div>

      {desktop ? null : (
        <>
          <BallotBar
            model={model}
            showFigures={showFigures}
            targetNoun={meta.targetNoun}
            optimize={optimizeAction}
            primary={barPrimary}
            onOpenBallot={() => setBallotSheetOpen(true)}
          />
          <BallotSheet
            open={ballotSheetOpen}
            onOpenChange={setBallotSheetOpen}
            title={meta.ballotLabel}
            model={model}
            showFigures={showFigures}
            highlightId={highlightId}
            optimize={optimizeAction}
            primary={barPrimary}
            onStep={(id, direction) =>
              editBallot((ballot) => stepEntry(ballot, id, direction), id)
            }
            onRemove={(id) =>
              editBallot((ballot) => removeFromBallot(ballot, id), null)
            }
          />
        </>
      )}

      <CheckoutSheet
        open={checkout.open}
        onOpenChange={(open) => {
          if (!open) {
            checkout.close()
            setDiff(null)
          }
        }}
        summary={signed?.summary ?? liveSummary}
        steps={checkout.started ? checkout.carousel.items : previewSteps}
        started={checkout.started}
        done={checkout.done}
        busy={checkout.busy}
        refresh={checkout.refresh}
        blockNumber={checkout.blockNumber}
        diff={checkout.started ? null : diffNode}
        sign={{
          label: signLabel,
          disabled:
            !voteReady ||
            checkout.busy ||
            checkout.refresh !== "done" ||
            diff !== null,
          onPress: sign,
        }}
        onRetryRefresh={checkout.openReview}
        onRetry={checkout.retry}
        safeJson={
          viewer.mode === "connected"
            ? checkout.safeJson(viewer.address, checkoutLocks, checkoutEntries)
            : null
        }
      />
    </>
  )
}

function TargetList({
  loading,
  targets,
  tabletUp,
  view,
  perUnitLabel,
  ballot,
  isWatching,
  addBlockedReason,
  onToggleBallot,
  onToggleWatch,
  onShareChange,
  onClearFilters,
}: {
  loading: boolean
  targets: VoteTarget[]
  tabletUp: boolean
  view: VoteView
  perUnitLabel: string
  ballot: Ballot
  isWatching: (address: string) => boolean
  addBlockedReason: (target: VoteTarget) => string | null
  onToggleBallot: (target: VoteTarget) => void
  onToggleWatch: (target: VoteTarget) => void
  onShareChange: (target: VoteTarget, bps: number) => void
  onClearFilters: () => void
}): ReactElement {
  const compact = view.density === "compact"
  const gridClass = compact
    ? "gap-3 [grid-template-columns:repeat(auto-fill,minmax(max(270px,calc((100%_-_24px)/3)),1fr))]"
    : "gap-x-[18px] gap-y-10 [grid-template-columns:repeat(auto-fill,minmax(max(290px,calc((100%_-_36px)/3)),1fr))]"

  if (loading)
    return (
      <ul
        aria-hidden="true"
        className={cn("m-0 grid list-none p-0", tabletUp ? gridClass : "gap-3")}
      >
        {["a", "b", "c", "d", "e", "f"].map((key) => (
          <li
            key={key}
            className={cn(
              "animate-pulse rounded-xl bg-inset motion-reduce:animate-none",
              tabletUp ? (compact ? "h-[224px]" : "h-[248px]") : "h-[60px]",
            )}
          />
        ))}
      </ul>
    )

  if (targets.length === 0)
    return (
      <EmptyState.Root>
        <EmptyState.Title>No matches</EmptyState.Title>
        <EmptyState.Action>
          <Button.Root variant="secondary" onClick={onClearFilters}>
            Clear filters
          </Button.Root>
        </EmptyState.Action>
      </EmptyState.Root>
    )

  if (!tabletUp)
    return (
      <ul className="m-0 flex list-none flex-col divide-y divide-line border-b border-line p-0">
        {targets.map((target) => (
          <li key={target.id}>
            <TargetRow
              target={target}
              bps={entryBps(ballot, target.id)}
              onBallot={hasEntry(ballot, target.id)}
              addBlocked={addBlockedReason(target)}
              onToggleBallot={() => onToggleBallot(target)}
              onShareChange={(bps) => onShareChange(target, bps)}
            />
          </li>
        ))}
      </ul>
    )

  return (
    <ul className={cn("m-0 grid list-none p-0", gridClass)}>
      {targets.map((target) => (
        <li key={target.id}>
          <TargetCard
            target={target}
            density={view.density}
            perUnitLabel={perUnitLabel}
            onBallot={hasEntry(ballot, target.id)}
            addBlocked={addBlockedReason(target)}
            watching={isWatching(target.id)}
            onToggleBallot={() => onToggleBallot(target)}
            onToggleWatch={() => onToggleWatch(target)}
          />
        </li>
      ))}
    </ul>
  )
}
