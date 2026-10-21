import type { CarouselItem } from "@/lib/carousel"
import * as Button from "@repo/ui/button"
import * as Dialog from "@repo/ui/dialog"
import * as SigningSteps from "@repo/ui/signing-steps"
import { useCopy } from "@repo/ui/use-copy"
import { Copy } from "lucide-react"
import type { ReactElement, ReactNode } from "react"
import { formatBps } from "./ballot"
import { formatApy, formatNativeList, formatUsd } from "./format"
import type { NativeAmount } from "./projection"
import type { RefreshState } from "./useVoteCheckout"

export type CheckoutSummary = {
  rows: Array<{ id: string; name: string; bps: number }>
  projectedMicroUsd: bigint
  native: NativeAmount[]
  apyBps: bigint | null
}

type CheckoutSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  summary: CheckoutSummary
  /** Rows to sign; before signing these preview as queued. */
  steps: CarouselItem[]
  started: boolean
  done: boolean
  /** A wallet prompt is open; the sheet stays put until it resolves. */
  busy: boolean
  refresh: RefreshState
  blockNumber: bigint | null
  /** Pre-sign diff; signing waits until it is answered. */
  diff: ReactNode
  sign: { label: string; disabled: boolean; onPress: () => void }
  onRetryRefresh: () => void
  onRetry: (id: string) => void
  safeJson: string | null
}

function groupThousands(value: bigint): string {
  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")
}

function stepStatus(item: CarouselItem): SigningSteps.SigningStepStatus {
  if (item.status === "signing") return "active"
  if (item.status === "queued") return "pending"
  return item.status
}

/** Review and signing bottom sheet over the dimmed Vote page (J05, 10, 23, 24). */
export default function CheckoutSheet(props: CheckoutSheetProps): ReactElement {
  const { summary } = props
  return (
    <Dialog.Root open={props.open} onOpenChange={props.onOpenChange}>
      <Dialog.Content
        placement="sheet"
        size="lg"
        aria-describedby={undefined}
        hideClose={props.busy}
        onInteractOutside={(event) => {
          // A stray click must not hide a wallet prompt in progress.
          if (props.busy) event.preventDefault()
        }}
        onEscapeKeyDown={(event) => {
          if (props.busy) event.preventDefault()
        }}
      >
        <Dialog.Header>
          <Dialog.Title className="text-[20px] font-500">
            {props.done ? "Vote submitted" : "Confirm vote"}
          </Dialog.Title>
        </Dialog.Header>
        <div className="flex flex-col gap-8 pb-2 md:flex-row md:gap-16">
          <section
            aria-labelledby="checkout-ballot"
            className="flex w-full shrink-0 flex-col gap-2.5 md:w-[280px]"
          >
            <h3
              id="checkout-ballot"
              className="text-caption font-500 uppercase text-muted"
            >
              Ballot
            </h3>
            <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
              {summary.rows.map((row) => (
                <li
                  key={row.id}
                  className="flex justify-between gap-4 text-body text-ink"
                >
                  <span className="truncate font-500">{row.name}</span>
                  <span className="tabular-nums">{formatBps(row.bps)}</span>
                </li>
              ))}
            </ul>
            <hr className="m-0 border-line" />
            <p className="flex justify-between gap-4 text-body text-ink">
              <span className="font-500">Projected this epoch</span>
              <span className="tabular-nums">
                {formatUsd(summary.projectedMicroUsd)}
              </span>
            </p>
            <p className="text-body-sm font-500 text-secondary tabular-nums">
              {formatNativeList(summary.native)}
              <span className="px-2">·</span>
              {formatApy(summary.apyBps)} APY
            </p>
          </section>

          <section
            aria-labelledby="checkout-signing"
            className="flex w-full min-w-0 flex-col gap-4 md:max-w-[480px]"
          >
            <h3
              id="checkout-signing"
              className="text-caption font-500 uppercase text-muted"
            >
              Signing
            </h3>
            {props.diff}
            <SigningSteps.Root className="py-2">
              {props.steps.map((item) => (
                <SigningSteps.Step
                  key={item.id}
                  status={props.started ? stepStatus(item) : "pending"}
                  label={item.label}
                  detail={
                    item.status === "signing" && props.started
                      ? "Waiting for wallet"
                      : item.status === "failed"
                        ? (item.error ?? "Failed")
                        : undefined
                  }
                  action={
                    item.status === "failed" ? (
                      <Button.Root
                        size="sm"
                        variant="soft"
                        onClick={() => props.onRetry(item.id)}
                      >
                        Retry
                      </Button.Root>
                    ) : undefined
                  }
                />
              ))}
            </SigningSteps.Root>
            {props.done ? (
              <output className="block text-body-sm font-500 text-pos">
                All locks signed
              </output>
            ) : null}
            {!props.started ? (
              <div className="flex flex-wrap items-center gap-3">
                <Button.Root
                  size="lg"
                  disabled={props.sign.disabled}
                  loading={props.refresh === "refreshing"}
                  onClick={props.sign.onPress}
                  className="h-11 w-full sm:h-10 sm:w-auto sm:min-w-[160px]"
                >
                  {props.sign.label}
                </Button.Root>
                <RefreshStatus
                  refresh={props.refresh}
                  blockNumber={props.blockNumber}
                  onRetry={props.onRetryRefresh}
                />
              </div>
            ) : props.done ? (
              <Dialog.Close asChild>
                <Button.Root size="lg" variant="secondary" className="w-fit">
                  Done
                </Button.Root>
              </Dialog.Close>
            ) : null}
            {props.safeJson ? <CopyJson value={props.safeJson} /> : null}
          </section>
        </div>
      </Dialog.Content>
    </Dialog.Root>
  )
}

function RefreshStatus({
  refresh,
  blockNumber,
  onRetry,
}: {
  refresh: RefreshState
  blockNumber: bigint | null
  onRetry: () => void
}): ReactElement | null {
  if (refresh === "refreshing")
    return (
      <output className="block text-body-sm font-500 text-muted">
        Refreshing votes and prices
      </output>
    )
  if (refresh === "failed")
    return (
      <span className="flex items-center gap-2 text-body-sm font-500 text-warn">
        <output>Refresh failed</output>
        <button
          type="button"
          onClick={onRetry}
          className="font-600 text-accent-ink underline-offset-2 hover:underline"
        >
          Retry
        </button>
      </span>
    )
  if (refresh === "done" && blockNumber !== null)
    return (
      <output className="block text-body-sm font-500 text-muted tabular-nums">
        Refreshed at block {groupThousands(blockNumber)}
      </output>
    )
  return null
}

function CopyJson({ value }: { value: string }): ReactElement {
  const { state, copy } = useCopy(value)
  return (
    <button
      type="button"
      onClick={() => void copy()}
      className="mt-2 flex w-fit items-center gap-1.5 text-body-sm font-500 text-secondary hover:text-ink"
    >
      <Copy aria-hidden="true" size={14} strokeWidth={1.75} />
      <span aria-live="polite">
        {state === "copied"
          ? "Copied"
          : state === "failed"
            ? "Copy failed"
            : "Copy tx JSON"}
      </span>
    </button>
  )
}
