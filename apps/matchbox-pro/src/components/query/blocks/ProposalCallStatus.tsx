import type { DispatchCallState } from "@/lib/wallet/useProposalDispatch"

const statusLabel: Record<DispatchCallState["status"], string> = {
  idle: "Not submitted",
  "opening-wallet": "Waiting for wallet",
  submitted: "Your wallet submitted this call",
  confirmed: "Confirmed",
  failed: "Failed",
}

export function ProposalCallStatus({
  calls,
}: {
  calls: DispatchCallState[]
}): JSX.Element | null {
  if (calls.length === 0) return null
  return (
    <ol className="mt-4 space-y-2" aria-label="Wallet call status">
      {calls.map((call, index) => (
        <li
          className="rounded-md border border-line bg-raised p-3"
          key={call.key}
        >
          <div className="flex items-start justify-between gap-3 text-xs">
            <span className="text-secondary">
              {index + 1}. {call.label}
            </span>
            <span className="shrink-0 font-mono text-muted">
              {statusLabel[call.status]}
            </span>
          </div>
          {call.hash && (
            <p className="mt-2 break-all font-mono text-xs text-positive">
              {call.hash}
            </p>
          )}
          {call.error && (
            <p className="mt-2 text-pretty text-xs text-warning" role="alert">
              {call.error}
            </p>
          )}
        </li>
      ))}
    </ol>
  )
}
