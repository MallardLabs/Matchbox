import SigningCarousel from "@/components/sheets/SigningCarousel"
import Button from "@/components/ui/Button"
import Sheet from "@/components/ui/Sheet"
import { useBtcPrice, useMezoPrice } from "@/hooks/usePrices"
import { useApproveAndAddIncentives } from "@/hooks/useWrites"
import {
  type CarouselState,
  createCarousel,
  markConfirmed,
  markFailed,
  retryItem,
} from "@/lib/carousel"
import { getContractConfig } from "@/lib/contracts"
import { ERC20_BALANCE_OF_ABI } from "@/lib/escrowAbi"
import { formatInputAmount, parseIncentiveAmount } from "@/lib/incentiveFlow"
import {
  formatMicroUsd,
  formatTokenAmountDigits,
  formatVeAmount,
} from "@/lib/money"
import { useNetwork } from "@/lib/network"
import { tokenUsdMicro } from "@/lib/tokenUsd"
import { type ReactElement, useState } from "react"
import type { Address } from "viem"
import { useAccount, useReadContract } from "wagmi"

const MEZO = "0x7B7c000000000000000000000000000000000001" as Address
const UPCOMING_TOKENS = ["BTC", "mUSD"] as const

type AddIncentivesSheetProps = {
  gaugeAddress: Address
  gaugeName: string
  tokenId: string | undefined
  onClose: () => void
}

/** Pen J08 / 16b–16d: amount form, then the approve + deposit signing carousel beside it. */
export default function AddIncentivesSheet({
  gaugeAddress,
  gaugeName,
  tokenId,
  onClose,
}: AddIncentivesSheetProps): ReactElement {
  const { chainId } = useNetwork()
  const { address: owner } = useAccount()
  const { data: btcPrice = null } = useBtcPrice()
  const { data: mezoPrice = null } = useMezoPrice()
  const incentives = useApproveAndAddIncentives()
  const [amount, setAmount] = useState("12000")
  const [carousel, setCarousel] = useState<CarouselState>({ items: [] })

  const { data: allowlisted } = useReadContract({
    ...getContractConfig(chainId).boostVoter,
    functionName: "isWhitelistedToken",
    args: [MEZO],
  })
  const { data: balance } = useReadContract({
    address: MEZO,
    abi: ERC20_BALANCE_OF_ABI,
    functionName: "balanceOf",
    args: owner ? [owner] : undefined,
    query: { enabled: Boolean(owner) },
  })

  const parsed = parseIncentiveAmount(amount, 18, balance)
  const estimatedMicroUsd = tokenUsdMicro({
    amount: parsed.valid ? parsed.atomic : 0n,
    decimals: 18,
    tokenAddress: MEZO,
    symbol: "MEZO",
    btcPriceUsd: btcPrice,
    mezoPriceUsd: mezoPrice,
  })
  const signing = carousel.items.length > 0
  const canContinue = parsed.valid && allowlisted !== false

  async function submit(): Promise<void> {
    if (!parsed.valid || allowlisted === false) return
    setCarousel(
      createCarousel([
        { id: "approve", label: "Approve MEZO" },
        { id: "deposit", label: `Deposit ${formatInputAmount(amount)} MEZO` },
      ]),
    )
    await incentives.submit(
      { token: MEZO, amount: parsed.atomic, gauge: gaugeAddress },
      (id, status, error) => {
        setCarousel((previous) => {
          if (status === "done") return markConfirmed(previous, id)
          if (status === "failed") {
            return markFailed(
              previous,
              id,
              error ?? "Transaction not completed",
            )
          }
          return previous
        })
      },
    )
  }

  function retry(id: string): void {
    setCarousel((previous) => retryItem(previous, id))
    void incentives.retry(id)
  }

  return (
    <Sheet
      open
      onOpenChange={(next) => {
        if (!next && !incentives.busy) onClose()
      }}
      title="Add incentives"
      description={`${gaugeName}${tokenId ? ` · #${tokenId}` : ""} · this epoch`}
      size="narrow"
    >
      <div className="flex flex-col gap-8">
        <form
          className="flex flex-col gap-3.5"
          onSubmit={(event) => {
            event.preventDefault()
            if (canContinue) void submit()
          }}
        >
          <fieldset disabled={signing} className="flex flex-col gap-3.5">
            <legend className="sr-only">Incentive deposit</legend>
            <fieldset>
              <legend className="mb-3.5 text-[11px] font-500 text-muted">
                Token
              </legend>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  aria-pressed="true"
                  className="h-8 rounded-2xl bg-accent-soft px-3 text-[13px] font-650 text-accent-ink"
                >
                  MEZO
                </button>
                {UPCOMING_TOKENS.map((symbol) => (
                  <button
                    key={symbol}
                    type="button"
                    disabled
                    title="Coming soon"
                    className="h-8 rounded-2xl bg-inset px-3 text-[13px] font-650 text-secondary disabled:opacity-50"
                  >
                    {symbol}
                  </button>
                ))}
              </div>
              {allowlisted === false ? (
                <p role="alert" className="mt-2 text-[12px] text-neg">
                  MEZO not allowlisted
                </p>
              ) : null}
            </fieldset>

            <div className="flex items-center gap-1.5 text-[11px] text-muted">
              <label htmlFor="incentive-amount" className="mr-auto font-500">
                Amount
              </label>
              <span className="tabular-nums">
                Balance{" "}
                {balance === undefined
                  ? "—"
                  : `${formatVeAmount(balance)} MEZO`}
              </span>
              <button
                type="button"
                disabled={balance === undefined}
                onClick={() =>
                  balance !== undefined &&
                  setAmount(formatTokenAmountDigits(balance, 18, 6))
                }
                className="font-700 text-accent-ink disabled:text-faint"
              >
                MAX
              </button>
            </div>
            <input
              id="incentive-amount"
              inputMode="decimal"
              autoComplete="off"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              aria-invalid={!parsed.valid}
              aria-describedby="incentive-amount-note"
              className="h-[53px] w-full rounded-lg bg-inset px-3 text-[22px] font-650 tabular-nums text-ink outline-none ring-accent/40 focus-visible:ring-2 disabled:text-secondary"
            />
            <p
              id="incentive-amount-note"
              className="flex justify-between gap-4 text-[13px] text-muted"
            >
              <span className="tabular-nums">
                ≈{" "}
                {estimatedMicroUsd > 0n
                  ? formatMicroUsd(estimatedMicroUsd)
                  : "—"}
              </span>
              {parsed.valid ? null : (
                <span role="alert" className="text-neg">
                  {parsed.message}
                </span>
              )}
            </p>
          </fieldset>
          <dl className="grid grid-cols-2 gap-3 rounded-lg bg-accent-soft p-3 text-[13px]">
            <div className="flex flex-col gap-0.5">
              <dt className="text-[11px] font-500 text-accent-ink/80">
                Starts
              </dt>
              <dd className="font-650 text-accent-ink">Next epoch</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-[11px] font-500 text-accent-ink/80">
                Withdrawable
              </dt>
              <dd className="font-650 text-accent-ink">No</dd>
            </div>
          </dl>
          {signing ? null : (
            <Button
              type="submit"
              size="lg"
              disabled={!canContinue}
              className="h-10 w-full rounded-lg text-[14px]"
            >
              Continue
            </Button>
          )}
        </form>

        {signing ? (
          <SigningCarousel
            state={carousel}
            {...(incentives.busy ? {} : { onRetry: retry })}
          />
        ) : null}
      </div>
    </Sheet>
  )
}
