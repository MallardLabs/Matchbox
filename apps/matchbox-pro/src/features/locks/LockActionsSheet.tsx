import type { ReactElement } from "react"
import LockActionList from "./LockActionList"
import { useLockFlows } from "./LockFlows"
import LockSheet from "./LockSheet"
import {
  type LockView,
  formatLockAmount,
  formatVotingPower,
  lockStatus,
  mergePlan,
} from "./lockModel"

/** Phones: a tapped lock opens its J02 action list as a bottom sheet. */
export default function LockActionsSheet({
  lock,
  locks,
  nowSeconds,
  onClose,
}: {
  lock: LockView
  locks: LockView[]
  nowSeconds: bigint
  onClose: () => void
}): ReactElement {
  const { open } = useLockFlows()
  const canMerge = locks.some((other) => mergePlan(lock, other).ok)
  return (
    <LockSheet
      title={`${lock.kind} #${lock.id}`}
      description={`${formatLockAmount(lock.kind, lock.amount)} · ${lockStatus(lock, nowSeconds)}`}
      onClose={onClose}
    >
      <p className="m-0 text-body-sm tabular-nums text-secondary">
        {formatVotingPower(lock.kind, lock.votingPower)}
      </p>
      <LockActionList lock={lock} variant="sheet" />
      <div className="flex gap-2 border-t border-line pt-3">
        <button
          type="button"
          onClick={() => open({ type: "transfer", lock })}
          className="flex h-11 flex-1 items-center justify-center rounded-lg bg-inset text-body font-500 text-ink"
        >
          Transfer
        </button>
        {canMerge ? (
          <button
            type="button"
            onClick={() => open({ type: "merge", lock })}
            className="flex h-11 flex-1 items-center justify-center rounded-lg bg-inset text-body font-500 text-ink"
          >
            Merge
          </button>
        ) : null}
      </div>
    </LockSheet>
  )
}
