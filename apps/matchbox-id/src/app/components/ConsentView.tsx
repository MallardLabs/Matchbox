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
import type { OidcScope } from "@repo/platform-contracts/scopes"
import * as Badge from "@repo/ui/badge"
import * as Button from "@repo/ui/button"
import { cn } from "@repo/ui/cn"
import * as Switch from "@repo/ui/switch"
import { shortenAddress } from "@repo/ui/wallet-address"
import { BadgeCheck } from "lucide-react"
import { type ReactElement, useId, useState } from "react"
import { legalLinks } from "../lib/legal"
import AppMark from "./AppMark"
import DiscordLinkHint from "./DiscordLinkHint"
import EnvChip from "./EnvChip"
import Identicon from "./Identicon"

export type ConsentDecision = "approve" | "deny"

export type ConsentViewProps = {
  request: AuthorizationRequestView
  account: IdentityAccount
  pending: ConsentDecision | null
  error: string | null
  /** `declinedScopes`: optional scopes switched off (approve only). */
  onDecision: (decision: ConsentDecision, declinedScopes: OidcScope[]) => void
  onSwitchAccount: () => void
}

/** Servers predating optional scopes send no requirement: required. */
function isOptional(scope: ConsentScope): boolean {
  return scope.requirement === "optional"
}

/** Optional scopes start off when declined before or unavailable now. */
function initiallyOff(scopes: readonly ConsentScope[]): Set<OidcScope> {
  return new Set(
    scopes
      .filter(
        (scope) =>
          isOptional(scope) &&
          (scope.previouslyDeclined === true || !scope.available),
      )
      .map((scope) => scope.scope),
  )
}

function websiteHost(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "")
  } catch {
    return "Website"
  }
}

function ClaimValue({ claim }: { claim: ClaimPreview }): ReactElement | null {
  if (claim.value === null) return null
  if (claim.claim === "wallet_address") {
    return (
      <span title={claim.value} className="font-mono text-label text-ink">
        <span aria-hidden="true">{shortenAddress(claim.value)}</span>
        <span className="sr-only">{claim.value}</span>
      </span>
    )
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
        className="size-5 rounded-full bg-inset-2"
      />
    )
  }
  if (claim.claim === "discord_id") {
    return <span className="font-mono text-label">{claim.value}</span>
  }
  return <span className="min-w-0 break-words">{claim.value}</span>
}

const claimLabels: Partial<Record<ClaimPreview["claim"], string>> = {
  wallet_address: "Address",
  wallet_network: "Network",
  discord_id: "Discord ID",
  discord_username: "Username",
  discord_display_name: "Display name",
  discord_avatar_url: "Avatar",
}

function ScopeRow({
  scope,
  on,
  disabled,
  onToggle,
}: {
  scope: ConsentScope
  on: boolean
  disabled: boolean
  onToggle: (on: boolean) => void
}): ReactElement {
  const labelId = useId()
  const optional = isOptional(scope)
  const isNew = !scope.previouslyGranted && scope.previouslyDeclined !== true
  const shown = scope.claims.filter(
    (claim) => claim.claim !== "sub" && claim.value !== null,
  )
  return (
    <li className="flex flex-col gap-2 border-t border-line py-3">
      <div className="flex min-h-[22px] items-center gap-2">
        <h3 id={labelId} className="text-body font-600 text-ink">
          {scope.label}
        </h3>
        <span className="text-caption text-secondary">
          {optional ? "Optional" : "Required"}
        </span>
        <span className="ml-auto flex items-center gap-2">
          {isNew && scope.available ? (
            <Badge.Root tone="accent" className="font-600">
              New
            </Badge.Root>
          ) : null}
          {!scope.available && !optional ? (
            <Badge.Root tone="neg" dot>
              Unavailable
            </Badge.Root>
          ) : null}
          {optional ? (
            <Switch.Root
              aria-labelledby={labelId}
              checked={on}
              disabled={disabled || !scope.available}
              onCheckedChange={onToggle}
            />
          ) : null}
        </span>
      </div>
      {scope.unavailableReason === "discord-not-linked" ? (
        <p className="text-body-sm">
          <DiscordLinkHint />
        </p>
      ) : scope.scope === "openid" ? (
        <p className="text-label text-secondary">Unique to this app</p>
      ) : shown.length === 0 ? (
        <p className="text-label text-secondary">{scope.description}</p>
      ) : (
        <dl
          className={cn(
            "m-0 flex flex-col gap-1.5 transition-opacity",
            on ? "" : "opacity-40",
          )}
        >
          {shown.map((claim) => (
            <div
              key={claim.claim}
              className="flex min-w-0 items-center justify-between gap-3 text-body-sm"
            >
              <dt className="shrink-0 text-secondary">
                {claimLabels[claim.claim] ?? claim.label}
              </dt>
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

function AppLinks({
  request,
}: {
  request: AuthorizationRequestView
}): ReactElement {
  const { app } = request
  const links = [
    {
      label: app.websiteUrl === null ? null : websiteHost(app.websiteUrl),
      href: app.websiteUrl,
    },
    { label: "Privacy", href: app.privacyUrl },
    { label: "Terms", href: app.termsUrl },
  ].filter(
    (link): link is { label: string; href: string } =>
      link.href !== null && link.label !== null,
  )
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <EnvChip kind={request.environmentKind} network={request.network} />
      {links.length === 0 ? null : (
        <ul className="m-0 flex list-none flex-wrap gap-x-3 gap-y-1 p-0 text-label font-600">
          {links.map((link) => (
            <li key={link.label}>
              <a
                href={link.href}
                target="_blank"
                rel="noreferrer noopener"
                className="rounded-sm text-accent-ink underline-offset-2 hover:underline"
              >
                {link.label}
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Consent card: who is asking, as which wallet, for what, sent where. */
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
  const [off, setOff] = useState(() => initiallyOff(request.scopes))
  const { app } = request
  const declinedScopes = request.scopes
    .filter(
      (scope) => isOptional(scope) && scope.available && off.has(scope.scope),
    )
    .map((scope) => scope.scope)

  function toggle(scope: OidcScope, on: boolean): void {
    setOff((current) => {
      const next = new Set(current)
      if (on) next.delete(scope)
      else next.add(scope)
      return next
    })
  }

  return (
    <article
      aria-labelledby={titleId}
      className="w-full bg-surface md:max-w-[480px] md:rounded-xl md:border md:border-line md:shadow-pop"
    >
      <header className="flex items-start gap-3.5 border-b border-line p-4 md:p-5">
        <AppMark name={app.name} logoUrl={app.logoUrl} size="lg" />
        <div className="flex min-w-0 flex-col gap-1.5">
          <h1
            id={titleId}
            className="flex flex-wrap items-center gap-2 text-[20px] font-400 leading-[26px] text-ink"
          >
            <span className="min-w-0 break-words">{app.name}</span>
            {app.verified ? (
              <Badge.Root tone="pos" className="font-600">
                <BadgeCheck aria-hidden="true" size={12} strokeWidth={2} />
                Verified
              </Badge.Root>
            ) : null}
          </h1>
          <AppLinks request={request} />
        </div>
      </header>

      <section
        aria-label="Account"
        className="flex min-w-0 items-center gap-2.5 border-b border-line px-4 py-3 md:px-5"
      >
        <span className="text-body-sm text-secondary">Account</span>
        <span className="flex h-[26px] min-w-0 items-center gap-1.5 rounded-md bg-inset px-2">
          <Identicon address={account.walletAddress} />
          <span
            title={account.walletAddress}
            className="font-mono text-label font-500 text-ink"
          >
            <span aria-hidden="true">
              {shortenAddress(account.walletAddress)}
            </span>
            <span className="sr-only">{account.walletAddress}</span>
          </span>
        </span>
        <Button.Root
          variant="ghost"
          size="sm"
          className="ml-auto"
          onClick={onSwitchAccount}
          disabled={pending !== null}
        >
          Switch
        </Button.Root>
      </section>

      <section
        aria-labelledby={scopesId}
        className="px-4 pb-0.5 pt-3.5 md:px-5"
      >
        <h2
          id={scopesId}
          className="pb-2 text-caption uppercase tracking-[0.04em] text-secondary"
        >
          Requested
        </h2>
        <ul className="m-0 list-none p-0">
          {request.scopes.map((scope) => (
            <ScopeRow
              key={scope.scope}
              scope={scope}
              on={!off.has(scope.scope) && scope.available}
              disabled={pending !== null}
              onToggle={(on) => toggle(scope.scope, on)}
            />
          ))}
        </ul>
      </section>

      <p className="flex min-w-0 items-center gap-2.5 border-t border-line px-4 py-3 text-body-sm text-secondary md:px-5">
        Redirect
        <span className="ml-auto min-w-0 break-all text-right font-mono text-label text-ink-2">
          {request.redirectHost}
        </span>
      </p>

      {error === null ? null : (
        <p role="alert" className="px-4 pb-1 text-body-sm text-neg md:px-5">
          {error}
        </p>
      )}

      <footer className="flex flex-col-reverse gap-2 border-t border-line p-4 md:flex-row md:justify-end md:px-5">
        <Button.Root
          variant="secondary"
          size="lg"
          className="h-11 text-body"
          loading={pending === "deny"}
          disabled={pending !== null}
          onClick={() => onDecision("deny", [])}
        >
          Cancel
        </Button.Root>
        <Button.Root
          size="lg"
          className="h-11 text-body"
          loading={pending === "approve"}
          disabled={pending !== null || !request.approvable}
          onClick={() => onDecision("approve", declinedScopes)}
        >
          Allow
        </Button.Root>
      </footer>
      <p className="border-t border-line px-4 py-2.5 text-label text-secondary md:px-5">
        <a
          href={legalLinks.privacy}
          target="_blank"
          rel="noreferrer noopener"
          className="rounded-sm underline-offset-2 hover:text-ink hover:underline"
        >
          Matchbox ID privacy
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      </p>
    </article>
  )
}
