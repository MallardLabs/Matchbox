import { useConnectDialog } from "@/app/ConnectDialog"
import type { ClaimSource } from "@/features/rewards/claimSources"
import { useClaimFlow } from "@/features/rewards/useClaimFlow"
import { useNetwork } from "@/lib/network"
import { useViewer } from "@/lib/viewer"
import * as Toast from "@repo/ui/toast"
import {
  type ReactElement,
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react"
import { usePublicClient } from "wagmi"
import LockActionsSheet from "./LockActionsSheet"
import ManageProfileSheet from "./ManageProfileSheet"
import MergeSheet from "./MergeSheet"
import NewLockSheet from "./NewLockSheet"
import TransferSheet from "./TransferSheet"
import WithdrawSheet from "./WithdrawSheet"
import { sourcesForLock } from "./claims"
import { LOCK_ESCROW_ABI, withEscrowErrors } from "./escrowWrites"
import { type LockActionId, type LockView, boostLabel } from "./lockModel"
import { useLockWrite } from "./useLockWrite"

export type LockFlow =
  /** All claim sources, or only one lock's (the face-down Claim row). */
  | { type: "claim"; lock: LockView | null }
  | { type: "new-lock" }
  | { type: "transfer"; lock: LockView }
  | { type: "merge"; lock: LockView }
  | { type: "withdraw"; lock: LockView }
  | { type: "manage-profile"; lock: LockView }
  | { type: "actions"; lock: LockView }

/** What a write button does for this viewer: sign, or fix the wallet first. */
export type WriteGate =
  | { canSign: true }
  | { canSign: false; label: string; resolve: () => void }

type QuickAction = Extract<
  LockActionId,
  "refresh-boost" | "auto-max-lock" | "disable-auto-max-lock"
>

type LockFlowsValue = {
  gate: WriteGate
  /** Opens a sheet, or the connect/switch step when this viewer can't sign. */
  open: (flow: LockFlow) => void
  runAction: (lock: LockView, action: LockActionId) => void
  /** `${lock.key}:${action}` of the quick action awaiting its receipt. */
  pendingAction: string | null
  /** The shared Rewards claim run: signing (`running`) or confirming. */
  claim: { running: boolean; confirming: boolean; reopen: () => void }
}

const LockFlowsContext = createContext<LockFlowsValue | null>(null)

export function useLockFlows(): LockFlowsValue {
  const value = useContext(LockFlowsContext)
  if (!value) throw new Error("useLockFlows must be used inside <LockFlows>")
  return value
}

export function useWriteGate(): WriteGate {
  const { viewer } = useViewer()
  const { switchWalletToApp } = useNetwork()
  const { open } = useConnectDialog()
  return useMemo<WriteGate>(() => {
    if (viewer.canSign) return { canSign: true }
    if (viewer.mode === "connected") {
      return {
        canSign: false,
        label: "Switch network",
        resolve: () => void switchWalletToApp(),
      }
    }
    return { canSign: false, label: "Connect to claim", resolve: open }
  }, [open, switchWalletToApp, viewer])
}

/** Hosts every lock sheet and the one-tap lock writes for the Overview. */
export default function LockFlows({
  locks,
  claimSources,
  nowSeconds,
  onChanged,
  children,
}: {
  locks: LockView[]
  claimSources: ClaimSource[]
  nowSeconds: bigint
  onChanged: () => Promise<void>
  children: ReactNode
}): ReactElement {
  const gate = useWriteGate()
  const { toast } = Toast.useToast()
  const { chainId } = useNetwork()
  const publicClient = usePublicClient({ chainId })
  const lockWrite = useLockWrite()
  const [flow, setFlow] = useState<LockFlow | null>(null)
  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const close = useCallback(() => setFlow(null), [])
  const refresh = useCallback(() => {
    void onChanged()
  }, [onChanged])
  // Claims run through the Rewards claim flow: one signature per source.
  const claimFlow = useClaimFlow(refresh)
  const { start: startClaim, running, confirming, reopen } = claimFlow

  const open = useCallback(
    (next: LockFlow) => {
      if (next.type !== "actions" && !gate.canSign) {
        gate.resolve()
        return
      }
      if (next.type === "claim") {
        const sources =
          next.lock === null
            ? claimSources
            : sourcesForLock(claimSources, next.lock)
        if (sources.length === 0) return
        setFlow(null)
        if (running) reopen()
        else startClaim(sources)
        return
      }
      setFlow(next)
    },
    [claimSources, gate, reopen, running, startClaim],
  )

  const quick = useCallback(
    async (lock: LockView, action: QuickAction) => {
      const { contracts, writeContractAsync, send } = lockWrite
      const escrow = lock.kind === "veMEZO" ? contracts.veMEZO : contracts.veBTC
      setPendingAction(`${lock.key}:${action}`)
      try {
        if (action === "refresh-boost") {
          const before = boostLabel(lock.votingPower, lock.unboostedVotingPower)
          const failure = await send(action, () =>
            writeContractAsync({
              ...contracts.boostVoter,
              functionName: "pokeBoost",
              args: [lock.tokenId],
            }),
          )
          if (failure) {
            toast({
              title: "Boost not refreshed",
              description: failure,
              tone: "error",
            })
            return
          }
          const after = publicClient
            ? await Promise.all([
                publicClient.readContract({
                  ...contracts.veBTC,
                  functionName: "votingPowerOfNFT",
                  args: [lock.tokenId],
                }),
                publicClient.readContract({
                  ...contracts.veBTC,
                  functionName: "unboostedVotingPowerOfNFT",
                  args: [lock.tokenId],
                }),
              ])
                .then(([power, unboosted]) => boostLabel(power, unboosted))
                .catch(() => null)
            : null
          toast({
            title: "Boost refreshed",
            description:
              after === null
                ? `veBTC #${lock.id}`
                : after === before
                  ? `veBTC #${lock.id} · still ${after}`
                  : `veBTC #${lock.id} · ${before ?? "—"} → ${after}`,
          })
          refresh()
          return
        }
        const enable = action === "auto-max-lock"
        const failure = await send(
          action,
          withEscrowErrors(() =>
            writeContractAsync({
              address: escrow.address,
              abi: LOCK_ESCROW_ABI,
              functionName: enable ? "lockPermanent" : "unlockPermanent",
              args: [lock.tokenId],
            }),
          ),
        )
        if (failure) {
          toast({
            title: enable ? "Auto max-lock not set" : "Auto max-lock still on",
            description: failure,
            tone: "error",
          })
          return
        }
        toast({
          title: enable ? "Auto max-locked" : "Auto max-lock off",
          description: `${lock.kind} #${lock.id}`,
        })
        refresh()
      } finally {
        setPendingAction(null)
      }
    },
    [lockWrite, publicClient, refresh, toast],
  )

  const runAction = useCallback(
    (lock: LockView, action: LockActionId) => {
      if (!gate.canSign) {
        gate.resolve()
        return
      }
      if (action === "claim") open({ type: "claim", lock })
      else if (action === "manage-profile")
        open({ type: "manage-profile", lock })
      else if (action === "withdraw") open({ type: "withdraw", lock })
      else if (pendingAction === null) void quick(lock, action)
    },
    [gate, open, pendingAction, quick],
  )

  const value = useMemo(
    () => ({
      gate,
      open,
      runAction,
      pendingAction,
      claim: { running, confirming, reopen },
    }),
    [confirming, gate, open, pendingAction, reopen, running, runAction],
  )

  return (
    <LockFlowsContext.Provider value={value}>
      {children}
      {claimFlow.sheet}
      {flow?.type === "new-lock" ? (
        <NewLockSheet onClose={close} onCreated={refresh} />
      ) : null}
      {flow?.type === "transfer" ? (
        <TransferSheet lock={flow.lock} onClose={close} onDone={refresh} />
      ) : null}
      {flow?.type === "merge" ? (
        <MergeSheet
          lock={flow.lock}
          locks={locks}
          nowSeconds={nowSeconds}
          onClose={close}
          onDone={refresh}
        />
      ) : null}
      {flow?.type === "withdraw" ? (
        <WithdrawSheet lock={flow.lock} onClose={close} onDone={refresh} />
      ) : null}
      {flow?.type === "manage-profile" ? (
        <ManageProfileSheet lock={flow.lock} onClose={close} />
      ) : null}
      {flow?.type === "actions" ? (
        <LockActionsSheet
          lock={flow.lock}
          locks={locks}
          nowSeconds={nowSeconds}
          onClose={close}
        />
      ) : null}
    </LockFlowsContext.Provider>
  )
}
