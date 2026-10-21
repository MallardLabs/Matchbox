import { cn } from "@repo/ui/cn"
import * as SegmentedControl from "@repo/ui/segmented-control"
import { type ReactElement, useState } from "react"
import type { Approval, Proposal, ZapRouteBlock } from "../contract"
import {
  formatBpsFixed,
  formatCountdown,
  formatToken,
  formatUsd,
  secondsUntil,
} from "../format"
import { DetailRow } from "../parts"
import useNow from "../useNow"

const UNAVAILABLE_COPY: Record<
  NonNullable<ZapRouteBlock["unavailableReason"]>,
  string
> = {
  no_approved_router: "No approved route for this deposit.",
  dual_deposit_unavailable: "Dual-deposit LP zaps are not available.",
  unsupported_asset: "This asset can't fund the deposit.",
  insufficient_balance: "Balance is below the amount.",
  quote_failed: "Quote failed. Ask again to re-quote.",
  price_impact_too_high: "Price impact is above the limit for this pool.",
  network_unsupported: "Zaps run on Mezo mainnet only.",
}

export function approvalsCopy(approvals: readonly Approval[]): string {
  if (approvals.length === 0) return "Not required"
  return approvals
    .map((approval) => `Exact ${formatToken(approval.amount)}`)
    .join(" · ")
}

const SLIPPAGE_CHOICES = [10, 50, 100] as const

export function simulationCopy(proposal: Proposal | null): {
  text: string
  tone: "ink" | "neg" | "warn"
} {
  if (!proposal) return { text: "Not run", tone: "warn" }
  const count = proposal.calls.length
  const calls = `${count} ${count === 1 ? "call" : "calls"}`
  switch (proposal.simulation.status) {
    case "passed":
      return {
        text:
          count > 1 && proposal.atomicity !== "single"
            ? `Passed · ${calls} · not atomic unless batched`
            : `Passed · ${calls}`,
        tone: "ink",
      }
    case "partial":
      return { text: `Partial · ${calls}`, tone: "warn" }
    case "blocked": {
      const reason = proposal.simulation.calls.find(
        (call) => call.status === "reverted",
      )?.reason
      return { text: reason ? `Blocked · ${reason}` : "Blocked", tone: "neg" }
    }
    case "not_run":
      return { text: "Not run", tone: "warn" }
  }
}

/** Frame 36: four route steps, quote terms, and an editable slippage. */
export function ZapRoute({
  block,
  proposal,
  onSlippage,
}: {
  block: ZapRouteBlock
  proposal: Proposal | null
  onSlippage: ((bps: number) => Promise<string | null>) | null
}): ReactElement {
  const quote = proposal?.quote ?? null
  const expiresAt = quote?.expiresAt ?? block.quoteExpiresAt
  const live = block.status === "quoted" && expiresAt !== null
  const now = useNow(live)
  const left = expiresAt ? secondsUntil(expiresAt, now) : 0
  const expired = block.status === "expired" || (live && left === 0)
  const [editing, setEditing] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const slippage = quote?.slippageBps ?? block.slippageBps
  const minReceived = quote?.minOut ?? block.minReceived
  const youPay = quote?.amountIn ?? block.youPay
  const impact = quote?.priceImpactBps ?? block.priceImpactBps
  const youPayUsd = quote?.amountInUsd ?? block.youPayUsd
  const simulation = simulationCopy(proposal)

  async function changeSlippage(value: string): Promise<void> {
    if (!onSlippage) return
    const bps = Number.parseInt(value, 10)
    setUpdating(true)
    setError(null)
    const failure = await onSlippage(bps)
    setUpdating(false)
    if (failure) setError(failure)
    else setEditing(false)
  }

  if (block.status === "unavailable" || block.status === "blocked") {
    return (
      <section aria-label="Zap route" className="flex flex-col gap-2">
        <p className="m-0 text-body-sm text-warn">
          {block.unavailableReason
            ? UNAVAILABLE_COPY[block.unavailableReason]
            : "Unavailable."}
        </p>
        <p className="m-0 text-label text-secondary">
          Destination · {block.destination.name}
        </p>
      </section>
    )
  }

  return (
    <section aria-label="Zap route" className="flex flex-col gap-3">
      <p
        className={cn("m-0 text-label", expired ? "text-neg" : "text-warn")}
        aria-live="polite"
      >
        {expired ? (
          "Quote expired"
        ) : (
          <>
            Quote · expires in{" "}
            <span className="tabular-nums">{formatCountdown(left)}</span>
          </>
        )}
        {" · approved router · exact-amount approval"}
      </p>
      <ol className="m-0 grid list-none grid-cols-2 gap-2 p-0 xl:grid-cols-4">
        {block.steps.map((step) => (
          <li
            key={step.index}
            className="flex min-w-0 flex-col gap-1 rounded-lg bg-inset p-3"
          >
            <span className="text-caption text-muted">{step.index}</span>
            <span className="truncate text-body-sm font-600 text-ink">
              {step.label}
            </span>
          </li>
        ))}
      </ol>
      <dl className="m-0 flex flex-col text-body-sm">
        <DetailRow label="You pay">
          {formatToken(youPay)}
          {youPayUsd ? (
            <span className="text-secondary"> · {formatUsd(youPayUsd)}</span>
          ) : null}
        </DetailRow>
        <DetailRow label="Min received">{formatToken(minReceived)}</DetailRow>
        <DetailRow
          label="Price impact"
          tone={
            block.priceImpactLevel === "blocked"
              ? "neg"
              : block.priceImpactLevel === "warn"
                ? "warn"
                : "ink"
          }
        >
          {impact === null ? "—" : formatBpsFixed(impact)}
          {block.feeBps !== null ? (
            <span className="text-secondary">
              {" "}
              · fee {formatBpsFixed(block.feeBps)}
            </span>
          ) : null}
        </DetailRow>
        <DetailRow label="Slippage">
          {editing && onSlippage ? (
            <span className="inline-flex items-center gap-2">
              <SegmentedControl.Root
                size="sm"
                aria-label="Slippage"
                value={String(slippage ?? 50)}
                onValueChange={(value) => void changeSlippage(value)}
              >
                {SLIPPAGE_CHOICES.map((bps) => (
                  <SegmentedControl.Item
                    key={bps}
                    value={String(bps)}
                    disabled={updating}
                  >
                    {formatBpsFixed(bps)}
                  </SegmentedControl.Item>
                ))}
              </SegmentedControl.Root>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="text-label text-secondary hover:text-ink"
              >
                Done
              </button>
            </span>
          ) : (
            <>
              {slippage === null ? "—" : formatBpsFixed(slippage)}
              {block.slippageEditable && onSlippage ? (
                <>
                  {" · "}
                  <button
                    type="button"
                    onClick={() => setEditing(true)}
                    className="text-ink underline-offset-2 hover:underline"
                  >
                    edit
                  </button>
                </>
              ) : null}
            </>
          )}
        </DetailRow>
        <DetailRow label="Approval">
          {approvalsCopy(proposal?.approvals ?? block.approvals)}
        </DetailRow>
        <DetailRow label="Vault shares">
          {block.shares
            ? `${formatToken(block.shares)} · ${block.sharesExact ? "1:1" : "expected"}`
            : "—"}
        </DetailRow>
        <DetailRow label="Simulation" tone={simulation.tone}>
          {simulation.text}
        </DetailRow>
        <DetailRow label="Network">
          Mezo mainnet
          {proposal ? ` · ${proposal.calculationVersion}` : ""}
        </DetailRow>
      </dl>
      {updating ? (
        <p className="m-0 text-label text-muted" aria-live="polite">
          Re-quoting…
        </p>
      ) : null}
      {error ? (
        <p className="m-0 text-label text-neg" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  )
}
