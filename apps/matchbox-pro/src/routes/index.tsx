import LockCard from "@/components/overview/LockCard"
import MyLocks, { LockGroup } from "@/components/overview/MyLocks"
import OverviewHero from "@/components/overview/OverviewHero"
import PublicMarketOverview from "@/components/overview/PublicMarketOverview"
import LockActionsSheet, {
  type LockAction,
} from "@/components/sheets/LockActionsSheet"
import NewLockSheet from "@/components/sheets/NewLockSheet"
import SigningCarousel from "@/components/sheets/SigningCarousel"
import Toast from "@/components/shell/Toast"
import Sheet from "@/components/ui/Sheet"
import { useWalletDialog } from "@/components/wallet/WalletDialogContext"
import { useClaimable } from "@/hooks/useClaimable"
import { useEpoch } from "@/hooks/useEpoch"
import { useVeBTCLocks, useVeMEZOLocks } from "@/hooks/useLocks"
import { usePersonalProjected } from "@/hooks/usePersonalProjected"
import { useGaugeProfiles } from "@/hooks/useProfiles"
import { useBatchVoteState } from "@/hooks/useVoteState"
import { useSequentialWrites } from "@/hooks/useWrites"
import {
  type CarouselState,
  createCarousel,
  markConfirmed,
  markFailed,
  retryItem,
} from "@/lib/carousel"
import {
  type OverviewLock,
  formatCompactNumber,
  resolveOverviewState,
} from "@/lib/overview"
import { calculateAnnualizedReturnBasisPoints } from "@/lib/rewardOptimizer"
import { createFileRoute } from "@tanstack/react-router"
import { type ReactElement, useCallback, useState } from "react"
import { useAccount } from "wagmi"

export const Route = createFileRoute("/")({
  component: OverviewPage,
})

function OverviewPage(): ReactElement {
  const { isConnected } = useAccount()
  const { openConnect } = useWalletDialog()
  const mezoLocks = useVeMEZOLocks()
  const btcLocks = useVeBTCLocks()
  const { label: epochRemaining } = useEpoch()
  const writes = useSequentialWrites()
  const { data: profiles } = useGaugeProfiles()
  const tokenIds = isConnected
    ? mezoLocks.locks.map((lock) => lock.tokenId)
    : []
  const claimable = useClaimable(tokenIds)
  const projection = usePersonalProjected(tokenIds)
  const { voteStateMap } = useBatchVoteState(tokenIds)
  const [claimOpen, setClaimOpen] = useState(false)
  const [newLockOpen, setNewLockOpen] = useState(false)
  const [carousel, setCarousel] = useState<CarouselState>({ items: [] })
  const [lockAction, setLockAction] = useState<LockAction | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const clearToast = useCallback(() => setToast(null), [])

  const nowSeconds = Math.floor(Date.now() / 1000)
  const veMezo: OverviewLock[] = mezoLocks.locks.map((lock) => ({
    ...lock,
    kind: "veMEZO",
    id: lock.tokenId.toString(),
    expired: !lock.isPermanent && lock.votingPower === 0n,
  }))
  const veBtc: OverviewLock[] = btcLocks.locks.map((lock) => ({
    ...lock,
    kind: "veBTC",
    id: lock.tokenId.toString(),
    expired: !lock.isPermanent && lock.votingPower === 0n,
  }))

  const votingPower = veMezo.reduce((sum, lock) => sum + lock.votingPower, 0n)
  const apr = calculateAnnualizedReturnBasisPoints({
    epochRewardMicroUsd: projection.projectedMicro,
    votingPowers: votingPower > 0n ? [votingPower] : [],
    assetPriceMicroUsd: projection.assetPriceMicroUsd,
  })
  const overviewState = resolveOverviewState({
    isConnected,
    isLoading: mezoLocks.isLoading || btcLocks.isLoading,
    hasError: Boolean(mezoLocks.error ?? btcLocks.error),
    hasLocks: veMezo.length > 0 || veBtc.length > 0,
  })

  if (overviewState === "disconnected") {
    return (
      <PublicMarketOverview
        epochRemaining={epochRemaining}
        onConnect={openConnect}
      />
    )
  }

  async function claimLocks(selected: typeof claimable.claims): Promise<void> {
    if (selected.length === 0) return
    setCarousel(
      createCarousel(
        selected.map((claim) => ({
          id: claim.tokenId.toString(),
          label: `Claim with veMEZO #${claim.tokenId.toString()}`,
        })),
      ),
    )
    setClaimOpen(true)
    await writes.run(
      selected.map((claim) => ({
        id: claim.tokenId.toString(),
        write: () =>
          writes.writeContractAsync({
            ...writes.contracts.boostVoter,
            functionName: "claimBribes",
            args: [claim.bribes, claim.tokens, claim.tokenId],
          }),
      })),
      (id, status, error) => {
        setCarousel((prev) => {
          if (status === "done") return markConfirmed(prev, id)
          if (status === "failed")
            return markFailed(prev, id, error ?? "Failed")
          return prev
        })
      },
    )
  }

  async function refreshBoost(tokenId: string): Promise<void> {
    try {
      await writes.writeContractAsync({
        ...writes.contracts.boostVoter,
        functionName: "pokeBoost",
        args: [BigInt(tokenId)],
      })
      await btcLocks.refetch()
      setToast(`Boost refreshed · veBTC #${tokenId}`)
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Boost refresh failed")
    }
  }

  function refetchLocks() {
    void Promise.all([mezoLocks.refetch(), btcLocks.refetch()])
  }

  function claimableFor(id: string): bigint {
    return claimable.rows
      .filter((row) => row.tokenId.toString() === id)
      .reduce(
        (sum, row) =>
          sum + row.rewards.reduce((acc, reward) => acc + reward.usdMicro, 0n),
        0n,
      )
  }

  function renderCard(lock: OverviewLock, siblings: OverviewLock[]) {
    const profile =
      lock.kind === "veBTC"
        ? profiles?.find((item) => item.vebtc_token_id === lock.id)
        : undefined
    return (
      <LockCard
        key={lock.id}
        lock={lock}
        nowSeconds={nowSeconds}
        voted={
          lock.kind === "veMEZO" &&
          voteStateMap.get(lock.id)?.hasVotedThisEpoch === true
        }
        profile={
          profile
            ? {
                displayName: profile.display_name,
                avatarUrl: profile.profile_picture_url,
                gaugeAddress: profile.gauge_address,
              }
            : undefined
        }
        claimableMicro={lock.kind === "veMEZO" ? claimableFor(lock.id) : 0n}
        canMerge={siblings.filter((item) => !item.expired).length > 1}
        onTransfer={() => setLockAction({ type: "transfer", lock })}
        onMerge={() => setLockAction({ type: "merge", lock })}
        onWithdraw={() => setLockAction({ type: "withdraw", lock })}
        onClaim={
          lock.kind === "veMEZO"
            ? () =>
                void claimLocks(
                  claimable.claims.filter(
                    (claim) => claim.tokenId.toString() === lock.id,
                  ),
                )
            : undefined
        }
        onRefreshBoost={
          lock.kind === "veBTC" ? () => void refreshBoost(lock.id) : undefined
        }
        onDragMerge={(fromId) => {
          const source = siblings.find((item) => item.id === fromId)
          if (source) setLockAction({ type: "merge", lock: source, into: lock })
        }}
      />
    )
  }

  const hasLocks = overviewState === "ready"
  const unvotedLocks = veMezo.filter(
    (lock) =>
      !lock.expired && voteStateMap.get(lock.id)?.hasVotedThisEpoch !== true,
  ).length

  return (
    <div className="flex flex-col gap-7">
      <OverviewHero
        votingPower={formatCompactNumber(votingPower / 10n ** 18n)}
        unvotedLocks={unvotedLocks}
        epochRemaining={epochRemaining}
        hasLocks={hasLocks}
        profiles={profiles}
        claimable={{
          totalMicro: claimable.totalMicro,
          rows: claimable.rows,
          isLoading: claimable.isLoading,
          canClaim: claimable.claims.length > 0,
          onClaimAll: () => void claimLocks(claimable.claims),
        }}
        projection={{
          projectedMicro: projection.projectedMicro,
          aprBasisPoints: apr,
          isLoading: projection.isLoading,
        }}
      />

      <MyLocks
        state={overviewState}
        onNewLock={() => setNewLockOpen(true)}
        onRetry={refetchLocks}
      >
        {veBtc.length > 0 ? (
          <LockGroup label="veBTC">
            {veBtc.map((lock) => renderCard(lock, veBtc))}
          </LockGroup>
        ) : null}
        {veMezo.length > 0 ? (
          <LockGroup label="veMEZO">
            {veMezo.map((lock) => renderCard(lock, veMezo))}
          </LockGroup>
        ) : null}
      </MyLocks>

      <NewLockSheet open={newLockOpen} onOpenChange={setNewLockOpen} />
      {lockAction ? (
        <LockActionsSheet
          key={`${lockAction.type}-${lockAction.lock.id}-${lockAction.type === "merge" ? (lockAction.into?.id ?? "") : ""}`}
          action={lockAction}
          nowSeconds={nowSeconds}
          mergeTargets={(lockAction.lock.kind === "veMEZO"
            ? veMezo
            : veBtc
          ).filter((lock) => lock.id !== lockAction.lock.id && !lock.expired)}
          onOpenChange={(open) => {
            if (!open) setLockAction(null)
          }}
          onDone={(message) => {
            setToast(message)
            refetchLocks()
          }}
        />
      ) : null}
      <Sheet
        open={claimOpen}
        onOpenChange={setClaimOpen}
        title="Claiming"
        size="narrow"
        description={
          carousel.items.length === 1
            ? "1 signature"
            : `${carousel.items.length} signatures`
        }
      >
        <SigningCarousel
          state={carousel}
          onRetry={(id) => {
            setCarousel((prev) => retryItem(prev, id))
            void writes.retry(id)
          }}
        />
      </Sheet>
      <Toast message={toast} onDone={clearToast} />
    </div>
  )
}
