import { formatMicroUsd } from "@/lib/money"
import { useViewer } from "@/lib/viewer"
import { cn } from "@repo/ui/cn"
import * as Toast from "@repo/ui/toast"
import {
  Download,
  Gift,
  LoaderCircle,
  Lock,
  LockOpen,
  type LucideIcon,
  RefreshCw,
  UserCog,
} from "lucide-react"
import type { ReactElement } from "react"
import { useLockFlows } from "./LockFlows"
import { type LockActionId, type LockView, lockActions } from "./lockModel"

const ICONS: Record<LockActionId, LucideIcon> = {
  claim: Gift,
  "refresh-boost": RefreshCw,
  "auto-max-lock": Lock,
  "disable-auto-max-lock": LockOpen,
  "manage-profile": UserCog,
  withdraw: Download,
}

/** J02 face-down action rows; also the rows of the phone actions sheet. */
export default function LockActionList({
  lock,
  variant,
}: {
  lock: LockView
  variant: "card" | "sheet"
}): ReactElement {
  const { viewer } = useViewer()
  const { runAction, pendingAction } = useLockFlows()
  const { toast } = Toast.useToast()
  const actions = lockActions(lock, { isOwner: viewer.mode === "connected" })

  return (
    <ul
      aria-label={`Actions for ${lock.kind} #${lock.id}`}
      className={cn(
        "m-0 flex list-none flex-col p-0",
        variant === "sheet" && "divide-y divide-line",
      )}
    >
      {actions.map((action) => {
        const Icon = ICONS[action.id]
        const pending = pendingAction === `${lock.key}:${action.id}`
        return (
          <li key={action.id}>
            <button
              type="button"
              aria-disabled={action.blocked !== null || undefined}
              aria-busy={pending || undefined}
              title={action.blocked ?? undefined}
              onClick={() => {
                if (action.blocked === null) runAction(lock, action.id)
                else if (variant === "card") {
                  // No room for the reason on the tile; say it on tap.
                  toast({
                    title: action.label,
                    description: action.blocked,
                    tone: "neutral",
                  })
                }
              }}
              className={cn(
                "flex w-full items-center gap-2 rounded-md text-left font-400 text-ink transition-colors aria-disabled:cursor-not-allowed",
                variant === "card"
                  ? "-mx-1 h-6 w-[calc(100%+8px)] px-1 text-body-sm hover:bg-ink/5"
                  : "min-h-12 gap-3 px-1 text-body hover:bg-inset",
              )}
            >
              {pending ? (
                <LoaderCircle
                  aria-hidden="true"
                  size={variant === "card" ? 14 : 16}
                  strokeWidth={1.75}
                  className="shrink-0 animate-spin text-secondary motion-reduce:animate-none"
                />
              ) : (
                <Icon
                  aria-hidden="true"
                  size={variant === "card" ? 14 : 16}
                  strokeWidth={1.75}
                  className="shrink-0 text-ink-2"
                />
              )}
              <span
                className={cn(
                  "flex min-w-0",
                  variant === "sheet" &&
                    "flex-1 items-center justify-between gap-3",
                )}
              >
                <span
                  className={cn(
                    "truncate",
                    action.blocked !== null && "text-secondary",
                  )}
                >
                  {action.label}
                </span>
                {action.blocked === null ? null : variant === "card" ? (
                  <span className="sr-only">. {action.blocked}</span>
                ) : (
                  <span className="truncate text-caption font-500 text-secondary">
                    {action.blocked}
                  </span>
                )}
              </span>
              {action.id === "claim" && action.blocked === null ? (
                <span className="ml-auto shrink-0 text-caption font-500 tabular-nums text-secondary">
                  {lock.claimable === null
                    ? null
                    : lock.claimable.usdMicro === 0n && lock.claimable.unpriced
                      ? "Unpriced"
                      : `${formatMicroUsd(lock.claimable.usdMicro)}${lock.claimable.unpriced ? "+" : ""}`}
                </span>
              ) : null}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
