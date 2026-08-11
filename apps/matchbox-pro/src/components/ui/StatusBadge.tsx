import { cn } from "@/utils/cn"

type Status =
  | "completed"
  | "pending"
  | "failed"
  | "passed"
  | "live"
  | "blocked"
  | "not-run"
  | "unsigned"
  | "needs-approval"
  | "read-only"
  | "unavailable"

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium capitalize",
        status === "completed" || status === "passed" || status === "unsigned"
          ? "bg-positive-soft text-positive"
          : status === "pending" ||
              status === "live" ||
              status === "needs-approval" ||
              status === "not-run" ||
              status === "read-only"
            ? "bg-warning-soft text-warning"
            : "bg-negative-soft text-negative",
      )}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {status}
    </span>
  )
}
