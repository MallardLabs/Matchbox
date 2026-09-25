import SigningCarousel from "@/components/sheets/SigningCarousel"
import Button from "@/components/ui/Button"
import Sheet from "@/components/ui/Sheet"
import { useSequentialWrites } from "@/hooks/useWrites"
import {
  type CarouselState,
  createCarousel,
  markConfirmed,
  markFailed,
  retryItem,
} from "@/lib/carousel"
import { cn } from "@/lib/cn"
import { ERC20_APPROVE_ABI } from "@/lib/escrowAbi"
import { formatVeAmount } from "@/lib/money"
import { type ReactElement, useState } from "react"
import { parseUnits } from "viem"
import { useAccount } from "wagmi"

type NewLockSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const YEAR_SECONDS = 365n * 24n * 60n * 60n
const MAX_LOCK_YEARS = 4n
const durations = [1n, 2n, 4n] as const

function parseMezo(value: string): bigint | null {
  try {
    const amount = parseUnits(value.replace(/,/g, ""), 18)
    return amount > 0n ? amount : null
  } catch {
    return null
  }
}

/** Pen 20 New lock: MEZO amount, duration chips, then the signing carousel. */
export default function NewLockSheet({
  open,
  onOpenChange,
}: NewLockSheetProps): ReactElement {
  const writes = useSequentialWrites()
  const { address } = useAccount()
  const [carousel, setCarousel] = useState<CarouselState>({ items: [] })
  const [signing, setSigning] = useState(false)
  const [amountInput, setAmountInput] = useState("100")
  const [years, setYears] = useState<(typeof durations)[number]>(4n)
  const amount = parseMezo(amountInput)

  function submit() {
    if (!address || amount === null) return
    setCarousel(
      createCarousel([
        { id: "approve", label: "Approve MEZO" },
        { id: "lock", label: "Create veMEZO lock" },
      ]),
    )
    setSigning(true)
    void writes.run(
      [
        {
          id: "approve",
          write: () =>
            writes.writeContractAsync({
              address: writes.contracts.mezoToken.address,
              abi: ERC20_APPROVE_ABI,
              functionName: "approve",
              args: [writes.contracts.veMEZO.address, amount],
            }),
        },
        {
          id: "lock",
          write: () =>
            writes.writeContractAsync({
              ...writes.contracts.veMEZO,
              functionName: "createLock",
              args: [amount, years * YEAR_SECONDS],
            }),
        },
      ],
      (id, status, error) => {
        setCarousel((prev) => {
          if (status === "done") return markConfirmed(prev, id)
          if (status === "failed")
            return markFailed(prev, id, error ?? "Failed")
          return prev
        })
      },
    )
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="New lock"
      description="veMEZO"
      size="narrow"
    >
      {signing ? (
        <SigningCarousel
          state={carousel}
          onRetry={(id) => {
            setCarousel((prev) => retryItem(prev, id))
            void writes.retry(id)
          }}
        />
      ) : (
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <label className="flex flex-col gap-3 text-[11px] text-muted">
            Lock amount
            <span className="flex h-12 items-center gap-2 rounded-lg bg-inset px-3 focus-within:ring-2 focus-within:ring-accent/40">
              <input
                name="amount"
                inputMode="decimal"
                autoComplete="off"
                value={amountInput}
                onChange={(event) => setAmountInput(event.target.value)}
                aria-invalid={amount === null}
                className="min-w-0 flex-1 bg-transparent text-[18px] font-650 tabular-nums text-ink focus:outline-none"
              />
              <span className="text-[18px] font-650 text-ink">MEZO</span>
            </span>
          </label>
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-3 text-[11px] text-muted">Duration</legend>
            <div className="flex flex-wrap gap-1.5">
              {durations.map((option) => (
                <label
                  key={option.toString()}
                  className={cn(
                    "flex h-7 cursor-pointer items-center rounded-full px-2.5 text-[12px] font-650 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent/40",
                    option === years
                      ? "bg-accent-soft text-accent-ink"
                      : "bg-inset text-secondary hover:text-ink",
                  )}
                >
                  <input
                    type="radio"
                    name="years"
                    checked={option === years}
                    onChange={() => setYears(option)}
                    className="sr-only"
                  />
                  {option === 1n ? "1 year" : `${option} years`}
                </label>
              ))}
            </div>
          </fieldset>
          <p className="text-[13px] font-650 tabular-nums text-ink">
            Voting power
            <span className="ml-1.5">
              ≈{" "}
              {amount === null
                ? "—"
                : formatVeAmount((amount * years) / MAX_LOCK_YEARS)}{" "}
              veMEZO
            </span>
          </p>
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="lg"
              className="h-9 bg-inset px-3.5 font-650"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="lg"
              className="h-9"
              disabled={writes.busy || !address || amount === null}
            >
              Lock MEZO
            </Button>
          </div>
        </form>
      )}
    </Sheet>
  )
}
