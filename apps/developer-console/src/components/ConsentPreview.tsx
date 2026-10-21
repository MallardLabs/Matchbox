import type {
  AuthorizationRequestDetail,
  ClaimPreview,
  ConsentScope,
} from "@repo/platform-contracts/identity"
import { networkNames } from "@repo/platform-contracts/network"
import { buttonStyles } from "@repo/ui/button"
import { cn } from "@repo/ui/cn"
import * as Switch from "@repo/ui/switch"
import { CircleCheck } from "lucide-react"
import { type ReactElement, useId, useState } from "react"
import { formatHost, humanize } from "../lib/format"
import AppMark from "./ui/AppMark"
import { EnvPill, Pill } from "./ui/Pill"

export type ConsentAudience = "new" | "returning"

const sampleWallet = "0x3D41…9DC3"

function ClaimRow({ claim }: { claim: ClaimPreview }): ReactElement {
  const mono = claim.claim === "wallet_address" || claim.claim === "discord_id"
  return (
    <div className="flex items-center justify-between gap-4 text-body-sm">
      <dt className="text-secondary">{claim.label}</dt>
      <dd
        className={cn(
          "m-0 min-w-0 truncate text-right text-ink",
          mono ? "font-mono text-label" : "font-500",
        )}
      >
        {claim.value ?? "—"}
      </dd>
    </div>
  )
}

function ScopeBlock({
  scope,
  audience,
}: {
  scope: ConsentScope
  audience: ConsentAudience
}): ReactElement {
  const [on, setOn] = useState(true)
  const optional = scope.requirement === "optional"
  const shown = scope.claims.filter((claim) => claim.claim !== "sub")
  const pendingReview = scope.unavailableReason === "not-approved"
  const fresh = audience === "new" || !scope.previouslyGranted
  return (
    <li className="flex flex-col gap-2 border-t border-line py-3 first:border-t-0">
      <p className="flex min-w-0 items-center gap-2">
        <span className="text-body font-600 text-ink">{scope.label}</span>
        <span className="text-caption text-muted">
          {optional ? "Optional" : "Required"}
        </span>
        <span className="flex-1" />
        {pendingReview ? (
          <Pill className="border border-accent bg-surface text-accent-ink">
            Pending review
          </Pill>
        ) : !scope.available ? (
          <Pill className="bg-neg/10 text-neg">
            {scope.unavailableReason === null
              ? "Unavailable"
              : humanize(scope.unavailableReason)}
          </Pill>
        ) : fresh ? (
          <Pill className="bg-accent-soft text-accent-ink">New</Pill>
        ) : null}
        {optional ? (
          <Switch.Root
            aria-label={`Share ${scope.label}`}
            checked={on}
            onCheckedChange={setOn}
          />
        ) : null}
      </p>
      {shown.length === 0 ? (
        <p className="text-label text-secondary">{scope.description}</p>
      ) : (
        <dl className="m-0 flex flex-col gap-1.5">
          {shown.map((claim) => (
            <ClaimRow key={claim.claim} claim={claim} />
          ))}
        </dl>
      )}
    </li>
  )
}

/**
 * The Matchbox ID consent screen for an environment, with sample values.
 * "Returning" hides the New chip on scopes an earlier grant covered.
 * Optional toggles work locally; Cancel / Allow are inert.
 */
export default function ConsentPreview({
  request,
  audience,
  verified,
}: {
  request: AuthorizationRequestDetail
  audience: ConsentAudience
  /** Live environment approved: show the Verified chip. */
  verified: boolean
}): ReactElement {
  const titleId = useId()
  const scopesId = useId()
  const { app } = request
  const scopes =
    audience === "returning"
      ? request.scopes
      : request.scopes.map((scope) => ({ ...scope, previouslyGranted: false }))
  return (
    <section
      aria-labelledby={titleId}
      className="flex w-full min-w-0 flex-col rounded-xl border border-line bg-surface"
    >
      <header className="flex items-start gap-3.5 p-5">
        <AppMark name={app.name} logoUrl={app.logoUrl} tone="ink" size="lg" />
        <div className="flex min-w-0 flex-col gap-1.5">
          <h3
            id={titleId}
            className="flex flex-wrap items-center gap-2 text-[20px] font-400 leading-tight text-ink"
          >
            <span className="min-w-0 break-words">{app.name}</span>
            {verified ? (
              <Pill className="bg-pos-soft text-pos">
                <CircleCheck aria-hidden="true" size={12} strokeWidth={2} />
                Verified
              </Pill>
            ) : null}
          </h3>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-label font-600 text-accent-ink">
            <EnvPill kind={request.environmentKind} full />
            {app.websiteUrl === null ? null : (
              <span>{formatHost(app.websiteUrl)}</span>
            )}
            {app.privacyUrl === null ? null : <span>Privacy</span>}
            {app.termsUrl === null ? null : <span>Terms</span>}
          </p>
        </div>
      </header>
      <p className="flex items-center gap-2.5 border-t border-line px-5 py-3 text-body-sm text-secondary">
        Account
        <span className="flex h-[26px] items-center gap-1.5 rounded-md bg-inset px-2 font-mono text-label text-ink">
          <span
            aria-hidden="true"
            className="size-3.5 rounded-full bg-gradient-to-br from-accent to-mezo"
          />
          {sampleWallet}
        </span>
        <span className="flex-1" />
        <span className="text-label font-500 text-secondary">Switch</span>
      </p>
      <section
        aria-labelledby={scopesId}
        className="border-t border-line px-5 pb-0.5 pt-3.5"
      >
        <h4
          id={scopesId}
          className="pb-2 text-caption uppercase tracking-[0.04em] text-muted"
        >
          Requested
        </h4>
        {scopes.length === 0 ? (
          <p className="py-3 text-label text-secondary">No OIDC scopes</p>
        ) : (
          <ol className="m-0 list-none p-0">
            {scopes.map((scope) => (
              <ScopeBlock key={scope.scope} scope={scope} audience={audience} />
            ))}
          </ol>
        )}
      </section>
      <p className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-5 py-3 text-body-sm text-secondary">
        Redirect
        <span className="break-all font-mono text-label text-ink-2">
          {request.redirectOrigin === ""
            ? "—"
            : formatHost(request.redirectOrigin)}
        </span>
      </p>
      <footer className="flex items-center gap-2 border-t border-line px-5 py-4">
        <span className="text-caption text-muted">
          {`Preview · sample values · ${networkNames[request.network]}`}
        </span>
        <span className="flex-1" />
        <span
          aria-hidden="true"
          className={buttonStyles({ variant: "secondary" })}
        >
          Cancel
        </span>
        <span aria-hidden="true" className={buttonStyles()}>
          Allow
        </span>
      </footer>
    </section>
  )
}
