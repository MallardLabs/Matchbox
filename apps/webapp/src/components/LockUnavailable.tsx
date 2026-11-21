import {
  LOCK_DATA_UNAVAILABLE_REASON,
  LOCK_UNAVAILABLE_LABEL,
  type LockReadFields,
  type LockStatus,
  getLockStatus,
} from "@/utils/lockReads"
import { Button, Tag } from "@mezo-org/mezo-clay"
import { useState } from "react"

// A lock whose reads failed is "unavailable", never "0 MEZO, Expired".
const LOCK_STATUS_TAG: Record<
  LockStatus,
  { color: "gray" | "green" | "red" | "yellow"; label: string }
> = {
  unavailable: { color: "gray", label: LOCK_UNAVAILABLE_LABEL },
  permanent: { color: "green", label: "Permanent" },
  expired: { color: "red", label: "Expired" },
  active: { color: "yellow", label: "Active" },
}

export function lockStatusTag(status: LockStatus): {
  color: "gray" | "green" | "red" | "yellow"
  label: string
} {
  return LOCK_STATUS_TAG[status]
}

/** The lock's status tag: Permanent, Active, Expired or a grey Unavailable. */
export function LockStatusTag({
  lock,
}: {
  lock: Pick<LockReadFields, "end" | "isPermanent" | "hasLockData">
}): JSX.Element {
  const tag = LOCK_STATUS_TAG[getLockStatus(lock, Date.now())]
  return (
    <Tag closeable={false} color={tag.color}>
      {tag.label}
    </Tag>
  )
}

/** Grey "Unavailable" in place of a lock amount, voting power or total. */
export function UnavailableValue({
  className = "",
}: {
  className?: string
}): JSX.Element {
  return (
    <span className={`text-[var(--content-secondary)] ${className}`}>
      {LOCK_UNAVAILABLE_LABEL}
    </span>
  )
}

/**
 * "Lock data unavailable. Try again." with a button that re-reads the locks.
 * Shown wherever a page's locks include one whose reads failed.
 */
export function LockDataUnavailableNotice({
  onRetry,
  className = "",
}: {
  onRetry: () => Promise<unknown>
  className?: string
}): JSX.Element {
  const [isRetrying, setIsRetrying] = useState(false)

  return (
    <output
      className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] px-3 py-2 text-xs text-[var(--content-secondary)] ${className}`}
    >
      <span>{LOCK_DATA_UNAVAILABLE_REASON}</span>
      <Button
        kind="tertiary"
        size="small"
        isLoading={isRetrying}
        onClick={() => {
          setIsRetrying(true)
          void onRetry().finally(() => setIsRetrying(false))
        }}
      >
        Try again
      </Button>
    </output>
  )
}
