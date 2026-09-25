import ClaimCluster from "@/components/rewards/ClaimCluster"
import ClaimSheet from "@/components/rewards/ClaimSheet"
import RecentClaims from "@/components/rewards/RecentClaims"
import RewardLedger from "@/components/rewards/RewardLedger"
import RewardsSummary from "@/components/rewards/RewardsSummary"
import {
  buildRewardSources,
  flattenRewardRows,
  formatNativeTotals,
} from "@/components/rewards/rewardRows"
import Button from "@/components/ui/Button"
import { useWalletDialog } from "@/components/wallet/WalletDialogContext"
import { useClaimable } from "@/hooks/useClaimable"
import { useEpoch } from "@/hooks/useEpoch"
import { useVeMEZOLocks } from "@/hooks/useLocks"
import { usePersonalProjected } from "@/hooks/usePersonalProjected"
import { useGaugeProfiles } from "@/hooks/useProfiles"
import { useRewardClaims } from "@/hooks/useRewardClaims"
import { formatMicroUsd } from "@/lib/money"
import { useNetwork } from "@/lib/network"
import { createFileRoute } from "@tanstack/react-router"
import { RefreshCw } from "lucide-react"
import { type ReactElement, useMemo, useState } from "react"
import { useAccount } from "wagmi"

export const Route = createFileRoute("/rewards")({ component: RewardsPage })

function RewardsPage(): ReactElement {
  const { address, isConnected } = useAccount()
  const { chainId } = useNetwork()
  return (
    <RewardsWallet
      key={`${chainId}:${address ?? "disconnected"}`}
      connected={isConnected}
    />
  )
}

function RewardsWallet({
  connected,
}: {
  connected: boolean
}): ReactElement {
  const { openConnect } = useWalletDialog()
  const locks = useVeMEZOLocks()
  const ids = useMemo(
    () => locks.locks.map((lock) => lock.tokenId),
    [locks.locks],
  )
  const rewards = useClaimable(ids)
  const projection = usePersonalProjected(ids)
  const transactions = useRewardClaims()
  const { data: profiles } = useGaugeProfiles()
  const epoch = useEpoch()
  const [reviewLock, setReviewLock] = useState<string | null>(null)

  const loading = connected && (locks.isLoading || rewards.isLoading)
  const error = locks.error ?? rewards.error
  const incomplete = rewards.failedReads > 0
  const stale = Boolean(
    rewards.indexedAt &&
      Date.now() - Date.parse(rewards.indexedAt) > 15 * 60_000,
  )
  const unavailable = !connected || loading || !!error
  const sources = buildRewardSources(rewards.rows, profiles)
  const rows = flattenRewardRows(sources)
  const unpriced = rows.filter((row) => !row.priceAvailable).length
  const lockOrder = rewards.claims.map((claim) => claim.tokenId.toString())
  const claim = rewards.claims.find(
    (item) => item.tokenId.toString() === reviewLock,
  )
  const canClaim =
    connected &&
    !transactions.wrongNetwork &&
    transactions.ready &&
    !loading &&
    !error &&
    !incomplete &&
    !stale &&
    !rewards.isFetching &&
    !transactions.pending &&
    !transactions.signing
  const warning =
    transactions.pending ||
    (transactions.wrongNetwork && connected) ||
    !!error ||
    incomplete ||
    stale
  const note = transactions.pending
    ? "Confirming"
    : transactions.wrongNetwork && connected
      ? "Wrong network"
      : error
        ? "Refresh failed"
        : incomplete
          ? "Incomplete"
          : stale
            ? "Out of date"
            : loading
              ? "Loading"
              : null
  const projected =
    !connected ||
    locks.isLoading ||
    projection.isLoading ||
    projection.error ||
    !projection.mezoPrice
      ? "—"
      : formatMicroUsd(projection.projectedMicro)

  function refresh(): void {
    void locks.refetch()
    void rewards.refetch()
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-[28px] font-600 leading-tight text-ink">Rewards</h1>
        {connected ? (
          <Button
            variant="secondary"
            size="sm"
            disabled={rewards.isFetching || locks.isLoading}
            onClick={refresh}
            className="h-8 rounded-md px-3 font-500"
          >
            <RefreshCw
              aria-hidden="true"
              size={13}
              strokeWidth={1.75}
              className={rewards.isFetching ? "animate-spin" : undefined}
            />
            Refresh
          </Button>
        ) : null}
      </header>

      <div className="flex flex-col gap-10 lg:flex-row">
        <div className="min-w-0 flex-1">
          <ClaimCluster
            value={
              unavailable || (rows.length > 0 && unpriced === rows.length)
                ? "—"
                : `${incomplete || unpriced > 0 ? "≥ " : ""}${formatMicroUsd(rewards.totalMicro)}`
            }
            natives={unavailable ? "" : formatNativeTotals(rows)}
            note={note}
            warn={warning}
            sources={unavailable ? [] : sources}
            lockOrder={lockOrder}
            reviewLabel={`Review claim${rewards.claims.length > 1 ? ` · ${rewards.claims.length} locks` : ""}`}
            canReview={canClaim && rewards.claims.length > 0}
            onReview={() =>
              setReviewLock(rewards.claims[0]?.tokenId.toString() ?? null)
            }
          />
        </div>
        <RecentClaims
          rows={transactions.rows}
          explorer={transactions.explorer}
          receiptError={!!transactions.receiptError}
        />
      </div>

      <RewardsSummary
        items={[
          {
            label: "Sources",
            value: unavailable ? "—" : String(sources.length),
          },
          {
            label: "Locks",
            value: unavailable ? "—" : String(lockOrder.length),
          },
          {
            label: "Projected",
            value: projected,
            qualifier: `${epoch.label} left`,
          },
          {
            label: "Unpriced",
            value: unavailable ? "—" : String(unpriced),
          },
        ]}
      />

      <RewardLedger
        status={
          loading
            ? "loading"
            : !connected
              ? "disconnected"
              : error
                ? "error"
                : "ready"
        }
        rows={rows}
        incomplete={incomplete}
        updatedAt={connected ? rewards.updatedAt : 0}
        onConnect={openConnect}
        onRetry={refresh}
      />

      {reviewLock !== null ? (
        <ClaimSheet
          tokenId={reviewLock}
          sources={sources.filter(
            (source) => source.tokenId.toString() === reviewLock,
          )}
          hasClaim={!!claim}
          signing={transactions.signing}
          pending={transactions.pending}
          canClaim={canClaim}
          error={transactions.error}
          onConfirm={() => {
            if (claim) void transactions.submit(claim)
          }}
          onClose={() => setReviewLock(null)}
        />
      ) : null}
    </div>
  )
}
