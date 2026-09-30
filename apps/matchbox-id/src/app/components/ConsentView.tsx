import type {
  AuthorizationRequestView,
  ClaimPreview,
  ConsentScope,
  IdentityAccount,
} from "@repo/platform-contracts/identity"
import {
  networkNames,
  networkSlugSchema,
} from "@repo/platform-contracts/network"
import * as Badge from "@repo/ui/badge"
import * as Button from "@repo/ui/button"
import * as Card from "@repo/ui/card"
import * as WalletAddress from "@repo/ui/wallet-address"
import { BadgeCheck, ExternalLink } from "lucide-react"
import { type ReactElement, useId } from "react"
import AppLogo from "./AppLogo"
import DiscordLinkHint from "./DiscordLinkHint"
import EnvironmentBadge from "./EnvironmentBadge"

export type ConsentDecision = "approve" | "deny"

export type ConsentViewProps = {
  request: AuthorizationRequestView
  account: IdentityAccount
  pending: ConsentDecision | null
  error: string | null
  onDecision: (decision: ConsentDecision) => void
  onSwitchAccount: () => void
}

function ClaimValue({ claim }: { claim: ClaimPreview }): ReactElement | null {
  if (claim.value === null) return null
  if (claim.claim === "wallet_address") {
    return <WalletAddress.Root address={claim.value} copyable={false} />
  }
  if (claim.claim === "wallet_network") {
    const network = networkSlugSchema.safeParse(claim.value)
    return (
      <span>{network.success ? networkNames[network.data] : claim.value}</span>
    )
  }
  if (claim.claim === "discord_avatar_url") {
    return (
      <img
        src={claim.value}
        alt=""
        referrerPolicy="no-referrer"
        className="size-5 rounded-full bg-inset"
      />
    )
  }
  if (claim.claim === "discord_id") {
    return <span className="font-mono text-[12px]">{claim.value}</span>
  }
  return <span>{claim.value}</span>
}

function ScopeRow({ scope }: { scope: ConsentScope }): ReactElement {
  const shown = scope.claims.filter(
    (claim) => claim.claim !== "sub" && claim.value !== null,
  )
  return (
    <li className="flex flex-col gap-2 border-t border-line py-3 first:border-t-0">
      <p className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[14px] font-600 text-ink">{scope.label}</span>
        {scope.available ? (
          scope.previouslyGranted ? (
            <Badge.Root>Granted</Badge.Root>
          ) : (
            <Badge.Root tone="accent">New</Badge.Root>
          )
        ) : (
          <Badge.Root tone="neg" dot>
            Unavailable
          </Badge.Root>
        )}
      </p>
      {scope.unavailableReason === "discord-not-linked" ? (
        <p className="text-[13px]">
          <DiscordLinkHint />
        </p>
      ) : shown.length === 0 ? (
        <p className="text-[12px] text-secondary">{scope.description}</p>
      ) : (
        <dl className="m-0 flex flex-col gap-1.5">
          {shown.map((claim) => (
            <div
              key={claim.claim}
              className="flex items-center justify-between gap-4 text-[13px]"
            >
              <dt className="text-secondary">{claim.label}</dt>
              <dd className="m-0 flex min-w-0 items-center justify-end text-right font-500 text-ink">
                <ClaimValue claim={claim} />
              </dd>
            </div>
          ))}
        </dl>
      )}
    </li>
  )
}

function ExternalLinks({
  app,
}: {
  app: AuthorizationRequestView["app"]
}): ReactElement | null {
  const links = [
    { label: "Website", href: app.websiteUrl },
    { label: "Privacy", href: app.privacyUrl },
    { label: "Terms", href: app.termsUrl },
  ].filter(
    (link): link is { label: string; href: string } => link.href !== null,
  )
  if (links.length === 0) return null
  return (
    <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-[12px]">
      {links.map((link) => (
        <li key={link.label}>
          <a
            href={link.href}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 font-600 text-accent-ink underline-offset-2 hover:underline"
          >
            {link.label}
            <ExternalLink aria-hidden="true" size={11} strokeWidth={2} />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        </li>
      ))}
    </ul>
  )
}

/** Consent screen: who is asking, as which wallet, for what, sent where. */
export default function ConsentView({
  request,
  account,
  pending,
  error,
  onDecision,
  onSwitchAccount,
}: ConsentViewProps): ReactElement {
  const titleId = useId()
  const scopesId = useId()
  const { app } = request
  return (
    <Card.Root variant="panel" aria-labelledby={titleId} className="w-full">
      <header className="flex items-start gap-3 border-b border-line p-5">
        <AppLogo name={app.name} logoUrl={app.logoUrl} size="lg" />
        <div className="flex min-w-0 flex-col gap-1.5">
          <h1
            id={titleId}
            className="flex flex-wrap items-center gap-2 text-[20px] font-650 leading-tight text-ink"
          >
            <span className="min-w-0 break-words">{app.name}</span>
            {app.verified ? (
              <Badge.Root tone="pos">
                <BadgeCheck aria-hidden="true" size={12} strokeWidth={2} />
                Verified
              </Badge.Root>
            ) : null}
            <EnvironmentBadge kind={request.environmentKind} />
          </h1>
          <ExternalLinks app={app} />
        </div>
      </header>

      <section
        aria-label="Account"
        className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3"
      >
        <p className="flex min-w-0 items-center gap-2 text-[13px] text-secondary">
          Account
          <WalletAddress.Root
            address={account.walletAddress}
            copyable={false}
          />
        </p>
        <Button.Root
          variant="ghost"
          size="sm"
          onClick={onSwitchAccount}
          disabled={pending !== null}
        >
          Switch
        </Button.Root>
      </section>

      <section aria-labelledby={scopesId} className="px-5 pt-4">
        <h2
          id={scopesId}
          className="text-[11px] font-650 uppercase tracking-[0.04em] text-secondary"
        >
          Requested
        </h2>
        <ol className="m-0 list-none p-0">
          {request.scopes.map((scope) => (
            <ScopeRow key={scope.scope} scope={scope} />
          ))}
        </ol>
      </section>

      <p className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-5 py-3 text-[13px] text-secondary">
        Redirect
        <span className="break-all font-mono text-[12px] text-ink-2">
          {request.redirectHost}
        </span>
      </p>

      {error === null ? null : (
        <p role="alert" className="px-5 pb-2 text-[13px] text-neg">
          {error}
        </p>
      )}

      <footer className="flex flex-col-reverse gap-2 border-t border-line p-5 sm:flex-row sm:justify-end">
        <Button.Root
          variant="secondary"
          size="lg"
          loading={pending === "deny"}
          disabled={pending !== null}
          onClick={() => onDecision("deny")}
        >
          Cancel
        </Button.Root>
        <Button.Root
          size="lg"
          loading={pending === "approve"}
          disabled={pending !== null || !request.approvable}
          onClick={() => onDecision("approve")}
        >
          Allow
        </Button.Root>
      </footer>
    </Card.Root>
  )
}
