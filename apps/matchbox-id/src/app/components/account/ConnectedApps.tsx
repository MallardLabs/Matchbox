import type {
  EndedGrant,
  GrantRevokedReason,
} from "@repo/platform-contracts/identity"
import {
  type OidcScope,
  scopeDefinitions,
} from "@repo/platform-contracts/scopes"
import * as Badge from "@repo/ui/badge"
import * as Button from "@repo/ui/button"
import { cn } from "@repo/ui/cn"
import * as EmptyState from "@repo/ui/empty-state"
import * as Skeleton from "@repo/ui/skeleton"
import * as Toast from "@repo/ui/toast"
import { BadgeCheck, ChevronDown, History, TriangleAlert } from "lucide-react"
import {
  type KeyboardEvent,
  type ReactElement,
  useEffect,
  useId,
  useRef,
  useState,
} from "react"
import type { ConnectedAppView } from "../../../shared/contracts"
import { formatShortDate } from "../../lib/format"
import { useGrants, useRevokeGrant } from "../../lib/queries"
import AppMark from "../AppMark"
import EnvChip from "../EnvChip"

const endedReasons = {
  "user-revoked": "Revoked",
  "app-suspended": "App suspended",
  "discord-link-changed": "Discord link changed",
  "scope-changed": "Scopes changed",
  "account-disabled": "Account disabled",
} as const satisfies Record<GrantRevokedReason, string>

function endedReason(reason: GrantRevokedReason | null): string {
  return reason === null ? "Ended" : endedReasons[reason]
}

/** Shared column layout: one grid, stacked below md. */
const rowGrid =
  "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 md:grid-cols-[minmax(0,1fr)_110px_300px_80px_80px]"

function ScopeChips({
  scopes,
  label,
}: {
  scopes: readonly OidcScope[]
  label: string
}): ReactElement {
  return (
    <ul
      aria-label={label}
      className="m-0 flex min-w-0 list-none flex-wrap gap-1 p-0"
    >
      {scopes.map((scope) => (
        <li key={scope}>
          <Badge.Root className="font-600">
            {scopeDefinitions[scope].label}
          </Badge.Root>
        </li>
      ))}
    </ul>
  )
}

function AppName({
  name,
  logoUrl,
  verified,
}: {
  name: string
  logoUrl: string | null
  verified: boolean
}): ReactElement {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <AppMark name={name} logoUrl={logoUrl} size="md" />
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="truncate text-body font-600 text-ink">{name}</span>
        {verified ? (
          <BadgeCheck
            role="img"
            aria-label="Verified"
            size={15}
            strokeWidth={2}
            className="shrink-0 text-pos"
          />
        ) : null}
      </span>
    </div>
  )
}

function AppRow({
  grant,
  confirming,
  onRevoke,
  onCancel,
}: {
  grant: ConnectedAppView
  confirming: boolean
  onRevoke: () => void
  onCancel: () => void
}): ReactElement {
  const revoke = useRevokeGrant()
  const { toast } = Toast.useToast()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const wasConfirming = useRef(false)

  useEffect(() => {
    if (confirming) cancelRef.current?.focus()
    else if (wasConfirming.current) triggerRef.current?.focus()
    wasConfirming.current = confirming
  }, [confirming])

  function confirm(): void {
    revoke.mutate(grant.id, {
      onSuccess: () =>
        toast({ title: `${grant.app.name} revoked`, tone: "success" }),
      onError: () => toast({ title: "Revoke failed", tone: "error" }),
    })
  }

  function onKeyDown(event: KeyboardEvent<HTMLFieldSetElement>): void {
    if (event.key === "Escape" && !revoke.isPending) {
      event.stopPropagation()
      onCancel()
    }
  }

  return (
    <li className="border-b border-line last:border-b-0">
      <div
        className={cn(
          rowGrid,
          "py-3",
          confirming &&
            "rounded-t-md border border-b-0 border-accent bg-accent-soft px-2.5",
        )}
      >
        <AppName
          name={grant.app.name}
          logoUrl={grant.app.logoUrl}
          verified={grant.verified}
        />
        <div className="col-span-2 flex min-w-0 flex-wrap items-center gap-1.5 md:contents">
          <div className="md:col-start-2 md:row-start-1">
            <EnvChip
              kind={grant.environmentKind}
              network={grant.network}
              compact
            />
          </div>
          <div className="min-w-0 md:col-start-3 md:row-start-1">
            <ScopeChips scopes={grant.scopes} label="Access" />
          </div>
          <p className="ml-auto text-label text-secondary md:col-start-4 md:row-start-1 md:ml-0">
            <span className="sr-only md:hidden">Granted </span>
            <time dateTime={grant.createdAt} className="tabular-nums">
              {formatShortDate(grant.createdAt)}
            </time>
          </p>
        </div>
        <div className="col-start-2 row-start-1 flex justify-end md:col-start-5">
          {confirming ? null : (
            <Button.Root
              ref={triggerRef}
              size="sm"
              variant="secondary"
              className="border-neg/30 text-neg hover:border-neg/50 hover:bg-neg-soft"
              aria-label={`Revoke ${grant.app.name}`}
              onClick={onRevoke}
            >
              Revoke
            </Button.Root>
          )}
        </div>
      </div>
      {confirming ? (
        <fieldset
          aria-label={`Revoke ${grant.app.name}`}
          onKeyDown={onKeyDown}
          className="m-0 mb-3 flex min-w-0 flex-wrap border-0 items-center gap-x-2.5 gap-y-2 rounded-b-md bg-neg-soft px-3.5 py-3"
        >
          <TriangleAlert
            aria-hidden="true"
            size={15}
            strokeWidth={1.75}
            className="shrink-0 text-neg"
          />
          <p className="flex min-w-0 flex-wrap items-baseline gap-x-2.5">
            <span className="text-body-sm font-600 text-ink">
              Revoke {grant.app.name}
            </span>
            <span className="text-label text-secondary">Tokens end now</span>
          </p>
          <span className="ml-auto flex items-center gap-1.5">
            <Button.Root
              ref={cancelRef}
              size="sm"
              variant="ghost"
              disabled={revoke.isPending}
              onClick={onCancel}
            >
              Cancel
            </Button.Root>
            <Button.Root
              size="sm"
              variant="danger"
              loading={revoke.isPending}
              onClick={confirm}
            >
              Revoke
            </Button.Root>
          </span>
        </fieldset>
      ) : null}
    </li>
  )
}

function EndedGrants({
  ended,
}: {
  ended: readonly EndedGrant[]
}): ReactElement | null {
  const [open, setOpen] = useState(false)
  const listId = useId()
  const [latest] = ended
  if (latest === undefined) return null
  return (
    <div className="flex flex-col border-t border-line">
      <div className="flex items-center gap-2.5 pt-3.5 text-label text-secondary">
        <History aria-hidden="true" size={14} strokeWidth={1.75} />
        <span>Ended · {ended.length}</span>
        <span className="hidden min-w-0 truncate sm:inline">
          {endedReason(latest.revokedReason)} ·{" "}
          {formatShortDate(latest.revokedAt)}
        </span>
        <Button.Root
          variant="ghost"
          size="sm"
          className="ml-auto"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? "Hide" : "Show"}
          <ChevronDown
            aria-hidden="true"
            size={13}
            strokeWidth={2}
            className={cn("transition-transform", open && "rotate-180")}
          />
        </Button.Root>
      </div>
      <ul id={listId} hidden={!open} className="m-0 mt-2 list-none p-0">
        {ended.map((grant) => (
          <li
            key={grant.id}
            className={cn(rowGrid, "border-t border-line py-3 text-secondary")}
          >
            <div className="opacity-70">
              <AppName
                name={grant.app.name}
                logoUrl={grant.app.logoUrl}
                verified={false}
              />
            </div>
            <div className="col-span-2 flex min-w-0 flex-wrap items-center gap-1.5 md:contents">
              <div className="md:col-start-2 md:row-start-1">
                <EnvChip
                  kind={grant.environmentKind}
                  network={grant.network}
                  compact
                />
              </div>
              <div className="min-w-0 md:col-start-3 md:row-start-1">
                <ScopeChips scopes={grant.scopes} label="Had access" />
              </div>
              <p className="ml-auto text-label md:col-span-2 md:col-start-4 md:row-start-1 md:ml-0 md:text-right">
                {endedReason(grant.revokedReason)} ·{" "}
                <time dateTime={grant.revokedAt} className="tabular-nums">
                  {formatShortDate(grant.revokedAt)}
                </time>
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Apps holding an active grant (access chips, revoke) and ended grants. */
export default function ConnectedApps(): ReactElement {
  const grants = useGrants(true)
  const [confirming, setConfirming] = useState<string | null>(null)

  if (grants.isPending) {
    return (
      <div aria-busy="true" className="flex flex-col gap-3 py-2">
        <output className="sr-only">Loading apps</output>
        <Skeleton.Root shape="block" className="h-11" />
        <Skeleton.Root shape="block" className="h-11" />
      </div>
    )
  }
  if (grants.isError) {
    return (
      <p role="alert" className="py-4 text-body-sm text-neg">
        Couldn’t load apps
      </p>
    )
  }
  const { data: active, ended } = grants.data
  return (
    <div className="flex flex-col">
      {active.length === 0 ? (
        <EmptyState.Root className="py-6">
          <EmptyState.Title asChild>
            <p>No connected apps</p>
          </EmptyState.Title>
        </EmptyState.Root>
      ) : (
        <>
          <div
            aria-hidden="true"
            className={cn(
              rowGrid,
              "hidden border-b border-line pb-2 text-caption text-secondary md:grid",
            )}
          >
            <span>App</span>
            <span>Env</span>
            <span>Access</span>
            <span>Granted</span>
            <span />
          </div>
          <ul aria-label="Connected apps" className="m-0 list-none p-0">
            {active.map((grant) => (
              <AppRow
                key={grant.id}
                grant={grant}
                confirming={confirming === grant.id}
                onRevoke={() => setConfirming(grant.id)}
                onCancel={() => setConfirming(null)}
              />
            ))}
          </ul>
        </>
      )}
      <EndedGrants ended={ended} />
    </div>
  )
}
