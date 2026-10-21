import { useConnectDialog } from "@/app/ConnectDialog"
import { useBtcPrice, useMezoPrice } from "@/hooks/usePrices"
import { formatMicroUsd, tokenUsdMicroValue } from "@/lib/money"
import { useNetwork } from "@/lib/network"
import { referencePriceUsd } from "@/lib/tokenUsd"
import { useViewer } from "@/lib/viewer"
import * as Button from "@repo/ui/button"
import { cn } from "@repo/ui/cn"
import * as Dialog from "@repo/ui/dialog"
import * as SigningSteps from "@repo/ui/signing-steps"
import { shortenAddress } from "@repo/ui/wallet-address"
import { useQueryClient } from "@tanstack/react-query"
import { X } from "lucide-react"
import {
  type ReactElement,
  type ReactNode,
  useEffect,
  useId,
  useState,
} from "react"
import type { Address, Hex } from "viem"
import { useBalance, usePublicClient } from "wagmi"
import { amountInputValue, checkAmount, formatNative } from "./model"
import {
  type IncentiveStep,
  failedStep,
  isComplete,
  needsApproval,
} from "./signing"
import { useAddIncentives } from "./useAddIncentives"
import {
  type IncentiveTokenState,
  maxDeposit,
  useIncentiveTokens,
} from "./useIncentiveTokens"

type AddIncentivesSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  gauge: Address
  gaugeName: string
  tokenId: string | undefined
}

/** Pen J08 / 16b–16d: amount form, then approve + deposit signing beside it. */
export default function AddIncentivesSheet({
  open,
  onOpenChange,
  ...props
}: AddIncentivesSheetProps): ReactElement {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      {open ? (
        <SheetContent {...props} onClose={() => onOpenChange(false)} />
      ) : null}
    </Dialog.Root>
  )
}

function SheetContent({
  gauge,
  gaugeName,
  tokenId,
  onClose,
}: Omit<AddIncentivesSheetProps, "open" | "onOpenChange"> & {
  onClose: () => void
}): ReactElement {
  const ids = useId()
  const queryClient = useQueryClient()
  const { chainId, switchWalletToApp, isSwitching } = useNetwork()
  const { viewer, stopWatching } = useViewer()
  const { open: openConnect } = useConnectDialog()
  const explorer = usePublicClient({ chainId })?.chain?.blockExplorers?.default
    .url
  const { data: btcPrice = null } = useBtcPrice()
  const { data: mezoPrice = null } = useMezoPrice()
  const signer = viewer.mode === "connected" ? viewer.address : undefined
  const tokenReads = useIncentiveTokens(signer)
  const gas = useBalance({
    address: signer,
    chainId,
    query: { enabled: Boolean(signer) },
  })
  // Both prompts pay gas in BTC; an empty wallet can't send either.
  const noGas = gas.data?.value === 0n
  const flow = useAddIncentives()

  const allowlisted = tokenReads.tokens.filter(
    (token) => token.allowlisted !== false,
  )
  const [selectedAddress, setSelectedAddress] = useState<Address | undefined>(
    undefined,
  )
  const selected: IncentiveTokenState | undefined =
    allowlisted.find((token) => token.address === selectedAddress) ??
    allowlisted[0]
  const [amount, setAmount] = useState("")
  const [preparing, setPreparing] = useState(false)

  const signing = flow.steps.length > 0
  const complete = isComplete(flow.steps)
  const busy = flow.busy || preparing
  const decimals = selected?.decimals
  const check =
    selected && decimals !== undefined
      ? checkAmount(
          amount,
          { decimals, symbol: selected.symbol },
          selected.balance,
        )
      : ({ kind: "empty" } as const)
  const atomic =
    check.kind === "ok" || check.kind === "insufficient" ? check.atomic : 0n
  const price = selected
    ? referencePriceUsd({
        tokenAddress: selected.address,
        symbol: selected.symbol,
        btcPriceUsd: btcPrice,
        mezoPriceUsd: mezoPrice,
      })
    : null
  const usd =
    price && decimals !== undefined
      ? formatMicroUsd(tokenUsdMicroValue(atomic, decimals, price))
      : "Unpriced"
  const message =
    check.kind === "invalid" || check.kind === "insufficient"
      ? check.message
      : ""
  // Balance must be known so an over-balance deposit can't reach the wallet.
  const ready =
    check.kind === "ok" &&
    selected?.allowlisted === true &&
    selected.balance !== undefined &&
    !noGas

  const { refetchWallet } = tokenReads
  useEffect(() => {
    if (!complete) return
    void refetchWallet()
    void queryClient.invalidateQueries({ queryKey: ["gauge-topology"] })
  }, [complete, queryClient, refetchWallet])

  async function submit(): Promise<void> {
    if (!ready || !selected || decimals === undefined || busy) return
    setPreparing(true)
    const allowance = await tokenReads.freshAllowance(selected.address)
    setPreparing(false)
    await flow.start({
      gauge,
      token: selected.address,
      symbol: selected.symbol,
      amount: check.atomic,
      amountLabel: formatNative(check.atomic, decimals),
      approve: needsApproval(allowance, check.atomic),
    })
  }

  function editAmount(): void {
    flow.reset()
    void refetchWallet()
  }

  const guard = (event: Event): void => {
    if (busy) event.preventDefault()
  }

  const subtitle = [gaugeName, tokenId ? `#${tokenId}` : null, "this epoch"]
    .filter(Boolean)
    .join(" · ")

  return (
    <Dialog.Content
      placement="sheet"
      size="lg"
      hideClose
      onEscapeKeyDown={guard}
      onInteractOutside={guard}
    >
      <div
        className={cn(
          "mx-auto grid w-full max-w-[480px] content-start gap-x-12 gap-y-3.5 pt-1 lg:pt-3",
          signing &&
            "lg:max-w-[948px] lg:grid-cols-[minmax(0,480px)_minmax(0,420px)] lg:grid-rows-[auto_1fr]",
        )}
      >
        <div className="flex items-start gap-3 lg:col-start-1 lg:row-start-1">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <Dialog.Title className="text-metric font-400">
              Add incentives
            </Dialog.Title>
            <Dialog.Description className="truncate text-label font-500 text-muted">
              {subtitle}
            </Dialog.Description>
          </div>
          <Dialog.Close
            aria-label="Close"
            disabled={busy}
            className="-mr-1.5 flex size-8 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-inset hover:text-ink disabled:opacity-40"
          >
            <X aria-hidden="true" size={16} strokeWidth={1.75} />
          </Dialog.Close>
        </div>

        {signing ? (
          <SigningPanel
            steps={flow.steps}
            busy={flow.busy}
            complete={complete}
            explorer={explorer}
            onRetry={flow.retry}
            onEdit={editAmount}
            onDone={onClose}
            className="lg:col-start-2 lg:row-span-2 lg:row-start-1"
          />
        ) : null}

        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
          className="flex min-w-0 flex-col gap-3.5 lg:col-start-1 lg:row-start-2 lg:self-start"
        >
          <fieldset
            disabled={signing || preparing}
            className="m-0 flex min-w-0 flex-col gap-3.5 border-0 p-0"
          >
            <legend className="sr-only">Deposit</legend>
            <fieldset className="m-0 min-w-0 border-0 p-0">
              <legend className="mb-3.5 p-0 text-caption font-500 text-muted">
                Token
              </legend>
              {tokenReads.isError ? (
                <p role="alert" className="m-0 text-body-sm text-neg">
                  Allowlist unavailable
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {allowlisted.map((token) => (
                    <label key={token.address} className="relative">
                      <input
                        type="radio"
                        name={`${ids}-token`}
                        value={token.address}
                        checked={selected?.address === token.address}
                        onChange={() => {
                          setSelectedAddress(token.address)
                          setAmount("")
                        }}
                        className="peer absolute inset-0 m-0 cursor-pointer opacity-0"
                      />
                      <span className="flex h-8 items-center rounded-2xl bg-inset px-3 text-body-sm font-400 text-secondary transition-colors peer-checked:bg-accent-soft peer-checked:text-accent-ink peer-hover:text-ink peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent-ink peer-disabled:opacity-60 peer-checked:peer-hover:text-accent-ink">
                        {token.symbol}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </fieldset>

            <div className="flex min-w-0 flex-col gap-3.5">
              <div className="flex items-center gap-1.5 text-caption">
                <label
                  htmlFor={`${ids}-amount`}
                  className="mr-auto font-500 text-muted"
                >
                  Amount
                </label>
                <span className="truncate tabular-nums text-muted">
                  Balance{" "}
                  {selected?.balance !== undefined && decimals !== undefined
                    ? `${formatNative(selected.balance, decimals)} ${selected.symbol}`
                    : "—"}
                </span>
                <button
                  type="button"
                  disabled={
                    selected?.balance === undefined || decimals === undefined
                  }
                  onClick={() => {
                    if (
                      selected?.balance === undefined ||
                      decimals === undefined
                    )
                      return
                    setAmount(
                      amountInputValue(
                        maxDeposit(selected, selected.balance),
                        decimals,
                      ),
                    )
                  }}
                  className="rounded px-0.5 font-700 text-accent-ink disabled:text-faint"
                >
                  MAX
                </button>
              </div>
              <input
                id={`${ids}-amount`}
                inputMode="decimal"
                autoComplete="off"
                placeholder="0"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                aria-invalid={message ? true : undefined}
                aria-describedby={`${ids}-amount-note`}
                className="h-[52px] w-full min-w-0 rounded-lg border border-transparent bg-inset px-3 text-metric font-400 tabular-nums text-ink outline-none placeholder:text-faint focus-visible:border-line-2 aria-[invalid=true]:border-neg disabled:text-secondary"
              />
              <p
                id={`${ids}-amount-note`}
                className="m-0 flex flex-wrap justify-between gap-x-4 gap-y-1 text-body-sm text-muted"
              >
                <span className="tabular-nums">≈ {usd} this epoch</span>
                <span aria-live="polite" className="text-neg">
                  {message}
                </span>
              </p>
            </div>
          </fieldset>

          <p className="m-0 text-pretty rounded-lg bg-accent-soft p-3 text-body-sm font-500 text-ink-2">
            Allowlisted tokens only. Incentives start paying the next epoch
            after deposit. Not withdrawable.
          </p>

          {signing ? null : (
            <SheetAction>
              {viewer.mode === "disconnected" ? (
                <Button.Root
                  size="lg"
                  onClick={openConnect}
                  className="w-full rounded-lg text-body"
                >
                  Connect wallet
                </Button.Root>
              ) : viewer.mode === "watching" ? (
                <>
                  <p className="m-0 text-label text-muted">
                    Watching {shortenAddress(viewer.address)} · read-only
                  </p>
                  <Button.Root
                    size="lg"
                    variant="secondary"
                    onClick={stopWatching}
                    className="w-full rounded-lg text-body"
                  >
                    Stop watching
                  </Button.Root>
                </>
              ) : viewer.wrongNetwork ? (
                <Button.Root
                  size="lg"
                  loading={isSwitching}
                  onClick={() => void switchWalletToApp()}
                  className="w-full rounded-lg text-body"
                >
                  Switch to Mezo
                </Button.Root>
              ) : noGas ? (
                <Button.Root
                  size="lg"
                  disabled
                  className="w-full rounded-lg text-body"
                >
                  No BTC for gas
                </Button.Root>
              ) : (
                <Button.Root
                  type="submit"
                  size="lg"
                  loading={preparing}
                  disabled={!ready}
                  className="w-full rounded-lg text-body"
                >
                  Continue
                </Button.Root>
              )}
            </SheetAction>
          )}
        </form>
      </div>
    </Dialog.Content>
  )
}

function SheetAction({ children }: { children: ReactNode }): ReactElement {
  return <div className="flex flex-col gap-2">{children}</div>
}

type SigningPanelProps = {
  steps: IncentiveStep[]
  busy: boolean
  complete: boolean
  explorer: string | undefined
  onRetry: (id: IncentiveStep["id"]) => void
  onEdit: () => void
  onDone: () => void
  className?: string
}

function TxLink({
  explorer,
  hash,
}: {
  explorer: string | undefined
  hash: Hex | undefined
}): ReactElement | null {
  if (!explorer || !hash) return null
  return (
    <a
      href={`${explorer}/tx/${hash}`}
      target="_blank"
      rel="noreferrer noopener"
      className="font-600 text-accent-ink underline-offset-2 hover:underline"
    >
      View transaction
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  )
}

function SigningPanel({
  steps,
  busy,
  complete,
  explorer,
  onRetry,
  onEdit,
  onDone,
  className,
}: SigningPanelProps): ReactElement {
  const failed = failedStep(steps)
  const last = steps[steps.length - 1]
  return (
    <section
      aria-labelledby="incentive-signing-label"
      className={cn("flex min-w-0 flex-col gap-2.5", className)}
    >
      <h3
        id="incentive-signing-label"
        className="m-0 text-caption font-400 uppercase tracking-[0.04em] text-muted"
      >
        Signing
      </h3>
      <div className="flex min-h-[148px] flex-col justify-center py-4 lg:min-h-[280px] lg:py-9">
        <SigningSteps.Root className="gap-3.5">
          {steps.map((step) => {
            const final = complete && step.id === last?.id
            return (
              <SigningSteps.Step
                key={step.id}
                status={step.status}
                label={
                  final ? (
                    <span className="text-metric font-700">{step.label}</span>
                  ) : (
                    step.label
                  )
                }
                detail={stepDetail(step, final)}
                action={stepAction({
                  step,
                  final,
                  busy,
                  explorer,
                  onRetry,
                  onEdit,
                })}
              />
            )
          })}
        </SigningSteps.Root>
      </div>
      {complete ? (
        <Button.Root
          variant="secondary"
          size="lg"
          onClick={onDone}
          className="w-full rounded-lg lg:w-fit lg:px-6"
        >
          Done
        </Button.Root>
      ) : steps.length > 1 && !failed ? (
        <p className="m-0 text-label text-muted">
          Approve, then deposit. Separate wallet prompts.
        </p>
      ) : null}
    </section>
  )
}

function stepDetail(step: IncentiveStep, final: boolean): ReactNode {
  if (final)
    return <span className="text-pos">Deposited. Nothing else to sign.</span>
  if (step.status === "failed") return step.error
  if (step.status !== "active") return undefined
  return step.phase === "confirming" ? "Confirming" : "Waiting for wallet"
}

function stepAction({
  step,
  final,
  busy,
  explorer,
  onRetry,
  onEdit,
}: {
  step: IncentiveStep
  final: boolean
  busy: boolean
  explorer: string | undefined
  onRetry: (id: IncentiveStep["id"]) => void
  onEdit: () => void
}): ReactNode {
  if (final || (step.status === "active" && step.phase === "confirming")) {
    return <TxLink explorer={explorer} hash={step.hash} />
  }
  if (step.status !== "failed") return undefined
  return (
    <>
      <TxLink explorer={explorer} hash={step.hash} />
      <Button.Root
        size="sm"
        variant="secondary"
        disabled={busy}
        onClick={() => onRetry(step.id)}
      >
        Retry
      </Button.Root>
      <Button.Root size="sm" variant="ghost" disabled={busy} onClick={onEdit}>
        Edit amount
      </Button.Root>
    </>
  )
}
