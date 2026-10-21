import { formatMicroUsd } from "@/lib/money"
import * as Button from "@repo/ui/button"
import * as Dialog from "@repo/ui/dialog"
import * as SigningSteps from "@repo/ui/signing-steps"
import type { ReactElement } from "react"
import {
  type ClaimRunPhase,
  type ClaimStep,
  isFailedStep,
  signingStatus,
  stepDetail,
} from "./claimRun"
import {
  type ClaimSource,
  pricedUsd,
  sourceShortLabel,
  sourceTokens,
} from "./claimSources"

type ClaimSheetProps = {
  open: boolean
  sources: ClaimSource[]
  steps: ClaimStep[]
  phase: ClaimRunPhase
  explorer: string | undefined
  onRetry: (key: string) => void
  onOpenChange: (open: boolean) => void
}

const sectionLabel =
  "text-caption font-600 uppercase tracking-[0.07em] text-muted"

/** J03 / 19 / 19b: sources and total, then one signature per source. */
export default function ClaimSheet({
  open,
  sources,
  steps,
  phase,
  explorer,
  onRetry,
  onOpenChange,
}: ClaimSheetProps): ReactElement {
  const tokens = sourceTokens(sources)
  const unpriced = tokens.some((token) => token.usdMicro === null)
  const done = steps.filter((step) => step.state === "done").length
  const title =
    phase === "complete"
      ? "Claimed"
      : phase === "partial"
        ? "Partly claimed"
        : phase === "failed"
          ? "Claim stopped"
          : "Claiming"

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content placement="sheet" size="lg">
        <Dialog.Header>
          <Dialog.Title className="font-500">{title}</Dialog.Title>
          <Dialog.Description className="text-label font-500 text-muted">
            {sources.length} {sources.length === 1 ? "source" : "sources"} ·{" "}
            {done} of {steps.length} signed
          </Dialog.Description>
        </Dialog.Header>

        <div className="flex flex-col gap-8 pt-1 md:flex-row md:gap-16">
          <section
            aria-labelledby="claim-sources-label"
            className="flex w-full flex-col gap-2.5 md:w-[280px] md:shrink-0"
          >
            <h3 id="claim-sources-label" className={sectionLabel}>
              Sources
            </h3>
            <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
              {sources.map((source) => (
                <li
                  key={source.key}
                  className="flex items-center justify-between gap-4 text-body-sm"
                >
                  <span className="truncate text-secondary">
                    {sourceShortLabel(source)}
                  </span>
                  <span className="shrink-0 text-ink tabular-nums">
                    {source.unpriced === source.tokens.length
                      ? "Unpriced"
                      : formatMicroUsd(source.usdMicro)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="flex items-center justify-between gap-4 border-t border-line pt-2.5 text-body-sm">
              <span className="text-secondary">Total</span>
              <span className="text-ink tabular-nums">
                {unpriced ? "≥ " : ""}
                {formatMicroUsd(pricedUsd(tokens))}
              </span>
            </p>
            <p className="text-label text-muted">One signature per source</p>
          </section>

          <section
            aria-labelledby="claim-signing-label"
            className="flex w-full min-w-0 flex-col gap-2.5 md:max-w-[420px]"
          >
            <h3 id="claim-signing-label" className={sectionLabel}>
              Signing
            </h3>
            <SigningSteps.Root className="py-2 md:min-h-[220px] md:justify-center md:py-10">
              {steps.map((step) => {
                const source = sources.find((item) => item.key === step.key)
                const label = source
                  ? `Claim ${sourceShortLabel(source).toLowerCase()}`
                  : "Claim"
                return (
                  <SigningSteps.Step
                    key={step.key}
                    status={signingStatus(step.state)}
                    label={label}
                    detail={
                      step.state === "done" && step.hash && explorer ? (
                        <a
                          href={`${explorer}/tx/${step.hash}`}
                          target="_blank"
                          rel="noreferrer"
                          className="underline-offset-2 hover:text-ink hover:underline"
                        >
                          View transaction
                        </a>
                      ) : (
                        stepDetail(step)
                      )
                    }
                    action={
                      isFailedStep(step.state) ? (
                        <Button.Root
                          variant="secondary"
                          size="sm"
                          onClick={() => onRetry(step.key)}
                        >
                          Retry
                        </Button.Root>
                      ) : undefined
                    }
                  />
                )
              })}
            </SigningSteps.Root>
            {phase === "complete" ||
            phase === "partial" ||
            phase === "failed" ? (
              <div className="flex flex-wrap items-center gap-3">
                <output className="text-body-sm text-secondary">
                  {phase === "complete"
                    ? `${done} of ${steps.length} claimed`
                    : `${done} of ${steps.length} claimed · not atomic`}
                </output>
                <Dialog.Close asChild>
                  <Button.Root
                    variant={phase === "complete" ? "primary" : "secondary"}
                    size="md"
                  >
                    {phase === "complete" ? "Done" : "Close"}
                  </Button.Root>
                </Dialog.Close>
              </div>
            ) : null}
          </section>
        </div>
      </Dialog.Content>
    </Dialog.Root>
  )
}
