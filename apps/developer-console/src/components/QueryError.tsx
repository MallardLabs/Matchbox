import * as Button from "@repo/ui/button"
import { cn } from "@repo/ui/cn"
import { CircleAlert } from "lucide-react"
import type { ReactElement } from "react"
import { ApiError, errorMessage } from "../lib/api-client"

type QueryErrorProps = {
  error: unknown
  onRetry?: () => void
  className?: string
}

/** Inline error for a failed read, with the request id and a retry. */
export default function QueryError({
  error,
  onRetry,
  className,
}: QueryErrorProps): ReactElement {
  const requestId = error instanceof ApiError ? error.requestId : null
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-wrap items-center gap-3 border-t border-line py-4 text-[13px]",
        className,
      )}
    >
      <CircleAlert
        aria-hidden="true"
        size={16}
        strokeWidth={1.75}
        className="shrink-0 text-neg"
      />
      <p className="min-w-0 flex-1 text-ink">
        {errorMessage(error)}
        {requestId === null ? null : (
          <span className="ml-2 font-mono text-[11px] text-secondary">
            {requestId}
          </span>
        )}
      </p>
      {onRetry === undefined ? null : (
        <Button.Root variant="secondary" size="sm" onClick={onRetry}>
          Retry
        </Button.Root>
      )}
    </div>
  )
}
