import SigningCarousel from "@/components/sheets/SigningCarousel"
import Button from "@/components/ui/Button"
import Sheet from "@/components/ui/Sheet"
import { formatMicroUsd, formatTokenAmountDigits } from "@/lib/money"
import { Loader } from "lucide-react"
import type { ReactElement } from "react"
import type { RewardSource } from "./rewardRows"

type ClaimSheetProps = {
  tokenId: string
  sources: RewardSource[]
  hasClaim: boolean
  signing: boolean
  pending: boolean
  canClaim: boolean
  error: string | null
  onConfirm: () => void
  onClose: () => void
}

const labelClass = "text-[11px] font-600 uppercase tracking-[0.07em] text-muted"

/** Pen J03 / 19: claim sources and total, then the wallet signing step. */
export default function ClaimSheet({
  tokenId,
  sources,
  hasClaim,
  signing,
  pending,
  canClaim,
  error,
  onConfirm,
  onClose,
}: ClaimSheetProps): ReactElement {
  const total = sources.reduce((sum, source) => sum + source.usdMicro, 0n)
  const unpriced = sources.some((source) => source.unpriced > 0)
  const step = `Claim veMEZO #${tokenId}`

  return (
    <Sheet
      open
      size="narrow"
      onOpenChange={(next) => {
        if (!next && !signing) onClose()
      }}
      title={
        pending ? "Claim submitted" : signing ? "Claiming" : "Review claim"
      }
      description={`${sources.length} source${sources.length === 1 ? "" : "s"} · veMEZO #${tokenId}`}
    >
      <section
        aria-labelledby="claim-sources-heading"
        className="flex flex-col gap-2.5"
      >
        <h3 id="claim-sources-heading" className={labelClass}>
          Sources
        </h3>
        {hasClaim ? (
          <>
            <ul className="flex flex-col gap-2.5">
              {sources.flatMap((source) =>
                source.rewards.map((reward) => (
                  <li
                    key={`${source.key}:${reward.tokenAddress}`}
                    className="flex items-center justify-between gap-4 text-[13px]"
                  >
                    <span className="truncate text-secondary">
                      {source.name}
                    </span>
                    <span className="shrink-0 font-650 tabular-nums text-ink">
                      {formatTokenAmountDigits(
                        reward.earned,
                        reward.decimals,
                        6,
                      )}{" "}
                      {reward.symbol}
                    </span>
                  </li>
                )),
              )}
            </ul>
            <p className="flex justify-between gap-4 border-t border-line pt-2.5 text-[13px]">
              <span className="text-secondary">Total</span>
              <span className="font-650 tabular-nums text-ink">
                {unpriced ? "≥ " : ""}
                {formatMicroUsd(total)}
              </span>
            </p>
          </>
        ) : (
          <p className="text-[13px] text-muted">Nothing to claim</p>
        )}
      </section>

      {signing ? (
        <SigningCarousel
          state={{ items: [{ id: "claim", label: step, status: "signing" }] }}
        />
      ) : pending ? (
        <p className="flex items-center gap-3 py-6 text-[22px] font-700 text-ink">
          <Loader
            aria-hidden="true"
            size={20}
            strokeWidth={1.75}
            className="animate-spin text-secondary motion-reduce:animate-none"
          />
          Confirming
        </p>
      ) : hasClaim ? (
        <Button
          size="lg"
          disabled={!canClaim}
          onClick={onConfirm}
          className="w-full rounded-lg text-[14px]"
        >
          Claim
        </Button>
      ) : null}
      {error ? (
        <p role="alert" className="text-pretty text-[13px] text-neg">
          {error}
        </p>
      ) : null}
    </Sheet>
  )
}
