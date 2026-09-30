import type {
  AuthorizationRequestDetail,
  ClaimPreview,
  ConsentScope,
} from "@repo/platform-contracts/identity"
import * as Badge from "@repo/ui/badge"
import * as Button from "@repo/ui/button"
import * as Card from "@repo/ui/card"
import { type ReactElement, useId } from "react"
import { humanize } from "../lib/format"
import { EnvBadge } from "./Badges"

function ClaimRow({ claim }: { claim: ClaimPreview }): ReactElement {
  return (
    <div className="flex items-center justify-between gap-4 text-[13px]">
      <dt className="text-secondary">{claim.label}</dt>
      <dd className="m-0 min-w-0 truncate text-right font-mono text-[12px] text-ink-2">
        {claim.value ?? "—"}
      </dd>
    </div>
  )
}

function ScopeRow({ scope }: { scope: ConsentScope }): ReactElement {
  const shown = scope.claims.filter((claim) => claim.claim !== "sub")
  return (
    <li className="flex flex-col gap-2 border-t border-line py-3 first:border-t-0">
      <p className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[14px] font-600 text-ink">{scope.label}</span>
        {scope.available ? (
          <Badge.Root tone="accent">New</Badge.Root>
        ) : (
          <Badge.Root tone="neg" dot>
            {scope.unavailableReason === null
              ? "Unavailable"
              : humanize(scope.unavailableReason)}
          </Badge.Root>
        )}
      </p>
      {shown.length === 0 ? (
        <p className="text-[12px] text-secondary">{scope.description}</p>
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

function AppMark({
  name,
  logoUrl,
}: {
  name: string
  logoUrl: string | null
}): ReactElement {
  return logoUrl === null ? (
    <span
      aria-hidden="true"
      className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-inset-2 text-[18px] font-650 text-accent-ink"
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  ) : (
    <img
      src={logoUrl}
      alt=""
      className="size-12 shrink-0 rounded-lg border border-line object-cover"
    />
  )
}

/**
 * Read-only rendering of the Matchbox ID consent screen for an environment,
 * using placeholder claim values. Buttons are inert.
 */
export default function ConsentPreview({
  request,
}: {
  request: AuthorizationRequestDetail
}): ReactElement {
  const titleId = useId()
  const scopesId = useId()
  const { app } = request
  return (
    <Card.Root
      variant="panel"
      aria-labelledby={titleId}
      className="w-full max-w-[440px]"
    >
      <header className="flex items-start gap-3 border-b border-line p-5">
        <AppMark name={app.name} logoUrl={app.logoUrl} />
        <div className="flex min-w-0 flex-col gap-1.5">
          <h3
            id={titleId}
            className="flex flex-wrap items-center gap-2 text-[20px] font-650 leading-tight text-ink"
          >
            <span className="min-w-0 break-words">{app.name}</span>
            <EnvBadge kind={request.environmentKind} />
          </h3>
          <p className="flex flex-wrap gap-x-4 text-[12px] font-600 text-accent-ink">
            {app.websiteUrl === null ? null : <span>Website</span>}
            {app.privacyUrl === null ? null : <span>Privacy</span>}
            {app.termsUrl === null ? null : <span>Terms</span>}
          </p>
        </div>
      </header>
      <p className="flex items-center justify-between gap-3 border-b border-line px-5 py-3 text-[13px] text-secondary">
        Account
        <span className="font-mono text-[12px] text-ink-2">0x1234…abcd</span>
      </p>
      <section aria-labelledby={scopesId} className="px-5 pt-4">
        <h4
          id={scopesId}
          className="text-[11px] font-650 uppercase tracking-[0.04em] text-secondary"
        >
          Requested
        </h4>
        {request.scopes.length === 0 ? (
          <p className="py-3 text-[12px] text-secondary">No OIDC scopes</p>
        ) : (
          <ol className="m-0 list-none p-0">
            {request.scopes.map((scope) => (
              <ScopeRow key={scope.scope} scope={scope} />
            ))}
          </ol>
        )}
      </section>
      <p className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-5 py-3 text-[13px] text-secondary">
        Redirect
        <span className="break-all font-mono text-[12px] text-ink-2">
          {request.redirectOrigin === "" ? "—" : request.redirectOrigin}
        </span>
      </p>
      <footer className="flex flex-col-reverse gap-2 border-t border-line p-5 sm:flex-row sm:justify-end">
        <Button.Root variant="secondary" size="lg" disabled>
          Cancel
        </Button.Root>
        <Button.Root size="lg" disabled>
          Allow
        </Button.Root>
      </footer>
    </Card.Root>
  )
}
