import SigningCarousel from "@/components/sheets/SigningCarousel"
import Sheet from "@/components/ui/Sheet"
import type { CarouselState } from "@/lib/carousel"
import {
  formatApyBasisPoints,
  formatMicroUsd,
  formatVeAmount,
} from "@/lib/money"
import { Copy } from "lucide-react"
import type { ReactElement } from "react"

type CheckoutSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  ballot: Array<{ address: string; name: string; percent: number }>
  projected: bigint
  projectedMezo: bigint | null
  projectedApy: bigint | null
  carousel: CarouselState
  safeJson: string | null
  onRetry: (id: string) => void
}

export default function CheckoutSheet({
  open,
  onOpenChange,
  ballot,
  projected,
  projectedMezo,
  projectedApy,
  carousel,
  safeJson,
  onRetry,
}: CheckoutSheetProps): ReactElement {
  const submitted =
    carousel.items.length > 0 &&
    carousel.items.every((item) => item.status === "done")

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={submitted ? "Vote submitted" : "Confirm vote"}
    >
      <div className="flex flex-wrap gap-x-16 gap-y-8">
        <section
          aria-labelledby="checkout-ballot"
          className="flex w-full flex-col gap-2.5 sm:w-[280px]"
        >
          <h3 id="checkout-ballot" className="text-[11px] font-650 text-muted">
            BALLOT
          </h3>
          <ul className="flex flex-col gap-2.5">
            {ballot.map((row) => (
              <Row
                key={row.address}
                label={row.name}
                value={`${row.percent}%`}
              />
            ))}
          </ul>
          <hr className="border-line" />
          <dl>
            <div className="flex justify-between text-[14px] text-ink">
              <dt className="font-500">Projected this epoch</dt>
              <dd className="font-650 tabular-nums">
                {formatMicroUsd(projected)}
              </dd>
            </div>
          </dl>
          <p className="whitespace-pre text-[13px] font-500 text-secondary tabular-nums">
            {projectedMezo === null
              ? "—"
              : `${formatVeAmount(projectedMezo)} MEZO`}
            {"     ·     "}
            {formatApyBasisPoints(projectedApy)} APY
          </p>
        </section>
        <div className="flex w-full max-w-[420px] flex-col gap-2.5">
          <SigningCarousel state={carousel} onRetry={onRetry} />
          {safeJson ? (
            <button
              type="button"
              onClick={() => void navigator.clipboard.writeText(safeJson)}
              className="flex items-center gap-1.5 self-start text-[13px] font-500 text-secondary hover:text-ink"
            >
              <Copy size={14} strokeWidth={1.75} aria-hidden="true" />
              Copy tx JSON
            </button>
          ) : null}
        </div>
      </div>
    </Sheet>
  )
}

function Row({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <li className="flex justify-between gap-4 text-[14px] text-ink">
      <span className="truncate font-500">{label}</span>
      <span className="font-650 tabular-nums">{value}</span>
    </li>
  )
}
