import type {
  ApiKeyRecord,
  Environment,
} from "@repo/platform-contracts/console"
import type { ApiKeyKind } from "@repo/platform-contracts/credentials"
import * as Button from "@repo/ui/button"
import { cn } from "@repo/ui/cn"
import * as Dialog from "@repo/ui/dialog"
import * as EmptyState from "@repo/ui/empty-state"
import * as Field from "@repo/ui/field"
import * as Fieldset from "@repo/ui/fieldset"
import * as Input from "@repo/ui/input"
import * as SegmentedControl from "@repo/ui/segmented-control"
import * as Select from "@repo/ui/select"
import * as Skeleton from "@repo/ui/skeleton"
import * as Table from "@repo/ui/table"
import * as Textarea from "@repo/ui/textarea"
import * as Toast from "@repo/ui/toast"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import {
  ArrowRight,
  Ban,
  Globe,
  Lock,
  Pencil,
  Plus,
  RefreshCw,
  X,
} from "lucide-react"
import {
  type FormEvent,
  type ReactElement,
  type ReactNode,
  useId,
  useMemo,
  useState,
} from "react"
import ConfirmDialog from "../../../../components/ConfirmDialog"
import EnvironmentGate from "../../../../components/EnvironmentGate"
import QueryError from "../../../../components/QueryError"
import RevealSecretDialog, {
  type SecretFact,
} from "../../../../components/RevealSecretDialog"
import UrlListEditor from "../../../../components/UrlListEditor"
import LockHint from "../../../../components/ui/LockHint"
import { EnvPill, Pill, environmentNames } from "../../../../components/ui/Pill"
import SectionHead from "../../../../components/ui/SectionHead"
import {
  CredentialStatusLabel,
  StatusDot,
} from "../../../../components/ui/Status"
import * as api from "../../../../lib/api"
import { ApiError, errorMessage } from "../../../../lib/api-client"
import {
  type ExpiryChoice,
  cidrEntryError,
  expiryChoices,
  expiryFor,
  isExpiryChoice,
  keyExpiry,
  keyLastUsed,
  rotatedAt,
  sameList,
} from "../../../../lib/api-keys"
import { useAppRoute } from "../../../../lib/app-route"
import { parseCidrList } from "../../../../lib/cidr"
import {
  dash,
  formatDate,
  formatInteger,
  formatMonthDay,
  shortName,
} from "../../../../lib/format"
import {
  apiKeysQuery,
  appQuery,
  keys,
  usageQuery,
} from "../../../../lib/queries"
import { isStepUpCancelled, useStepUp } from "../../../../lib/step-up"
import { rangeWindow } from "../../../../lib/usage-range"

export const Route = createFileRoute("/_app/apps/$appId/keys")({
  component: KeysTab,
})

function KeysTab(): ReactElement {
  const { appId, kind } = useAppRoute()
  return (
    <EnvironmentGate key={kind} appId={appId} kind={kind}>
      {(environment) => <KeysPanel environment={environment} />}
    </EnvironmentGate>
  )
}

const kindLabels: Record<ApiKeyKind, string> = {
  secret: "Secret",
  publishable: "Publishable",
}

function KindPill({ kind }: { kind: ApiKeyKind }): ReactElement {
  return (
    <Pill className={kind === "secret" ? "bg-inset-2 text-ink" : undefined}>
      {kindLabels[kind]}
    </Pill>
  )
}

type Revealed = { key: string; facts: SecretFact[]; kind: ApiKeyKind }

function revealFacts(record: ApiKeyRecord): SecretFact[] {
  return [
    { term: "Name", value: record.name },
    { term: "Type", value: kindLabels[record.kind] },
    {
      term: "Expires",
      value: record.expiresAt === null ? "Never" : formatDate(record.expiresAt),
    },
    ...(record.kind === "secret"
      ? [
          {
            term: "Allowed IPs",
            value: (
              <span className="font-mono">
                {record.allowedCidrs.length === 0
                  ? "Any"
                  : record.allowedCidrs.length}
              </span>
            ),
          },
        ]
      : []),
  ]
}

function KeysPanel({
  environment,
}: {
  environment: Environment
}): ReactElement {
  const list = useQuery(apiKeysQuery(environment.id))
  const app = useQuery(appQuery(environment.appId))
  const orgId = app.data?.organizationId
  const members = useQuery({
    queryKey: keys.members(orgId ?? ""),
    queryFn: () => api.orgs.members(orgId ?? ""),
    enabled: orgId !== undefined,
  })
  const week = useMemo(() => rangeWindow("7d"), [])
  const usage = useQuery(usageQuery({ environmentId: environment.id, ...week }))
  const [selectedId, setSelectedId] = useState<string | null | undefined>(
    undefined,
  )
  const [creating, setCreating] = useState(false)
  const [revealed, setRevealed] = useState<Revealed | null>(null)
  const [rotating, setRotating] = useState<ApiKeyRecord | null>(null)
  const [revoking, setRevoking] = useState<ApiKeyRecord | null>(null)
  const [editingOrigins, setEditingOrigins] = useState(false)
  const queryClient = useQueryClient()
  const stepUp = useStepUp()
  const { toast } = Toast.useToast()
  const panelId = useId()
  const now = Date.now()

  const records = list.data?.data ?? []
  const selected =
    selectedId === null
      ? undefined
      : selectedId === undefined
        ? records[0]
        : records.find((record) => record.id === selectedId)
  const rotated = rotatedAt(records)
  const memberName = (accountId: string | null): string | null =>
    members.data?.data.find((member) => member.accountId === accountId)
      ?.displayName ?? null
  const requestsFor = (record: ApiKeyRecord): number | null =>
    usage.data === undefined
      ? null
      : (usage.data.byKey.find((row) => row.apiKeyId === record.id)?.requests ??
        0)

  async function refresh(): Promise<void> {
    await queryClient.invalidateQueries({
      queryKey: keys.apiKeys(environment.id),
    })
  }

  let body: ReactElement
  if (list.isPending) {
    body = (
      <div aria-busy="true" className="flex flex-col gap-3">
        {["a", "b", "c"].map((key) => (
          <Skeleton.Root key={key} shape="block" className="h-11" />
        ))}
      </div>
    )
  } else if (list.isError) {
    body = <QueryError error={list.error} onRetry={() => void list.refetch()} />
  } else if (records.length === 0) {
    body = (
      <EmptyState.Root>
        <EmptyState.Title>No API keys</EmptyState.Title>
        <EmptyState.Action>
          <Button.Root onClick={() => setCreating(true)}>
            Create key
          </Button.Root>
        </EmptyState.Action>
      </EmptyState.Root>
    )
  } else {
    body = (
      <Table.Root>
        <Table.Header>
          <Table.Row>
            <Table.Head className="pl-2.5">Key</Table.Head>
            <Table.Head className="hidden w-[196px] md:table-cell">
              Prefix
            </Table.Head>
            <Table.Head className="hidden w-[70px] lg:table-cell">
              Last used
            </Table.Head>
            <Table.Head className="hidden w-[66px] sm:table-cell">
              Expires
            </Table.Head>
            <Table.Head className="w-[78px] pr-2.5">Status</Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {records.map((record) => {
            const isSelected = record.id === selected?.id
            const expiry = keyExpiry(record.expiresAt, now)
            const rotatedOn = rotated.get(record.id)
            return (
              <Table.Row
                key={record.id}
                interactive
                selected={isSelected}
                onClick={() => setSelectedId(record.id)}
                className={cn(
                  isSelected &&
                    "outline outline-1 -outline-offset-1 outline-accent",
                )}
              >
                <Table.Cell className="py-3 pl-2.5">
                  <span className="flex min-w-0 flex-col gap-[3px]">
                    <span className="flex min-w-0 items-center gap-2">
                      <button
                        type="button"
                        aria-pressed={isSelected}
                        aria-controls={panelId}
                        onClick={(event) => {
                          event.stopPropagation()
                          setSelectedId(record.id)
                        }}
                        className="truncate text-left text-body-sm font-600 text-ink hover:underline"
                      >
                        {record.name}
                      </button>
                      <KindPill kind={record.kind} />
                    </span>
                    {rotatedOn === undefined ? null : (
                      <span className="text-caption text-muted">
                        {`Rotated ${formatMonthDay(rotatedOn)}`}
                      </span>
                    )}
                  </span>
                </Table.Cell>
                <Table.Cell
                  mono
                  className={cn(
                    "hidden md:table-cell",
                    record.status === "active" ? "text-ink" : "text-muted",
                  )}
                >
                  {record.displayPrefix}
                </Table.Cell>
                <Table.Cell className="hidden text-secondary lg:table-cell">
                  {keyLastUsed(record.lastUsedAt, now)}
                </Table.Cell>
                <Table.Cell
                  className={cn(
                    "hidden sm:table-cell",
                    record.status === "revoked"
                      ? "text-muted"
                      : expiry.soon
                        ? "font-600 text-accent-ink"
                        : "text-secondary",
                  )}
                >
                  {record.status === "revoked" ? dash : expiry.label}
                </Table.Cell>
                <Table.Cell className="pr-2.5">
                  <CredentialStatusLabel status={record.status} />
                </Table.Cell>
              </Table.Row>
            )
          })}
        </Table.Body>
      </Table.Root>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-7 xl:grid-cols-[minmax(0,1fr)_380px]">
      <section
        aria-labelledby={`${panelId}-keys`}
        className="flex min-w-0 flex-col"
      >
        <SectionHead
          id={`${panelId}-keys`}
          title="Keys"
          count={list.data === undefined ? undefined : records.length}
          className="pb-3"
        >
          <Button.Root onClick={() => setCreating(true)}>
            <Plus aria-hidden="true" size={14} strokeWidth={2} />
            New key
          </Button.Root>
        </SectionHead>
        {body}
        <div className="flex min-w-0 items-center gap-2 px-2.5 pt-4">
          <Globe
            aria-hidden="true"
            size={14}
            strokeWidth={1.75}
            className="shrink-0 text-muted"
          />
          <span className="shrink-0 text-label text-secondary">Origins</span>
          <span className="flex min-w-0 flex-1 gap-2 truncate font-mono text-label text-ink">
            {environment.origins.length === 0
              ? "None"
              : environment.origins.join("  ")}
          </span>
          <Button.Root
            variant="ghost"
            size="sm"
            onClick={() => setEditingOrigins(true)}
          >
            Edit
            <ArrowRight aria-hidden="true" size={13} strokeWidth={1.75} />
          </Button.Root>
        </div>
      </section>
      {selected === undefined ? null : (
        <KeyPanel
          key={`${selected.id}-${selected.allowedCidrs.join(",")}-${selected.expiresAt ?? ""}`}
          id={panelId}
          record={selected}
          environment={environment}
          createdBy={memberName(selected.createdBy)}
          requests={requestsFor(selected)}
          onClose={() => setSelectedId(null)}
          onRotate={() => setRotating(selected)}
          onRevoke={() => setRevoking(selected)}
          onSaved={refresh}
        />
      )}
      <CreateKeyDialog
        environment={environment}
        open={creating}
        onOpenChange={setCreating}
        onCreated={async (result) => {
          setCreating(false)
          setSelectedId(result.apiKey.id)
          setRevealed({
            key: result.key,
            facts: revealFacts(result.apiKey),
            kind: result.apiKey.kind,
          })
          await refresh()
        }}
        create={(body) =>
          stepUp.run(() => api.environments.createApiKey(environment.id, body))
        }
      />
      <RotateKeyDialog
        apiKey={rotating}
        onClose={() => setRotating(null)}
        rotate={(record, overlapSeconds) =>
          stepUp.run(() => api.apiKeys.rotate(record.id, overlapSeconds))
        }
        onRotated={async (result) => {
          setRotating(null)
          setSelectedId(result.apiKey.id)
          setRevealed({
            key: result.key,
            facts: revealFacts(result.apiKey),
            kind: result.apiKey.kind,
          })
          await refresh()
        }}
      />
      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(open) => {
          if (!open) setRevoking(null)
        }}
        title="Revoke key?"
        description={
          <>
            <span className="font-mono text-ink">
              {revoking?.displayPrefix}
            </span>{" "}
            stops working within 15 s.
          </>
        }
        confirmLabel="Revoke"
        onConfirm={async () => {
          if (revoking === null) return
          await api.apiKeys.revoke(revoking.id)
          await refresh()
          toast({ title: "Key revoked" })
        }}
      />
      <RevealSecretDialog
        secret={revealed?.key ?? null}
        title="Key created"
        label={
          revealed?.kind === "publishable" ? "Publishable key" : "Secret key"
        }
        copyLabel="Copy key"
        envVar={
          revealed?.kind === "publishable"
            ? "MATCHBOX_PUBLISHABLE_KEY"
            : "MATCHBOX_API_KEY"
        }
        environmentKind={environment.kind}
        facts={revealed?.facts}
        onDone={() => {
          setRevealed(null)
          toast({ title: "Key ready" })
        }}
      />
      <Dialog.Root open={editingOrigins} onOpenChange={setEditingOrigins}>
        <Dialog.Content size="md" aria-describedby={undefined}>
          <Dialog.Header className="flex-row items-center gap-2.5">
            <Dialog.Title>Origins</Dialog.Title>
            <EnvPill kind={environment.kind} full />
          </Dialog.Header>
          <UrlListEditor
            key={`origins-${environment.updatedAt}`}
            mode="origin"
            kind={environment.kind}
            values={environment.origins}
            onSave={async (origins) => {
              const updated = await stepUp.run(() =>
                api.environments.replaceOrigins(environment.id, origins),
              )
              queryClient.setQueryData(
                keys.environment(environment.appId, environment.kind),
                updated,
              )
              await queryClient.invalidateQueries({
                queryKey: keys.app(environment.appId),
              })
              toast({ title: "Origins saved" })
            }}
          />
        </Dialog.Content>
      </Dialog.Root>
    </div>
  )
}

function PanelRow({
  term,
  children,
}: {
  term: string
  children: ReactNode
}): ReactElement {
  return (
    <div className="flex min-w-0 items-center gap-3 border-b border-line py-2.5">
      <dt className="shrink-0 text-body-sm text-secondary">{term}</dt>
      <span className="flex-1" />
      <dd className="m-0 min-w-0 truncate text-body-sm text-ink">{children}</dd>
    </div>
  )
}

type ExpiryEdit = "keep" | ExpiryChoice | "now"

function KeyPanel({
  id,
  record,
  environment,
  createdBy,
  requests,
  onClose,
  onRotate,
  onRevoke,
  onSaved,
}: {
  id: string
  record: ApiKeyRecord
  environment: Environment
  createdBy: string | null
  requests: number | null
  onClose: () => void
  onRotate: () => void
  onRevoke: () => void
  onSaved: () => Promise<void>
}): ReactElement {
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(record.name)
  const [cidrs, setCidrs] = useState<string[]>(record.allowedCidrs)
  const [candidate, setCandidate] = useState("")
  const [expiry, setExpiry] = useState<ExpiryEdit>("keep")
  const stepUp = useStepUp()
  const { toast } = Toast.useToast()
  const fieldId = useId()
  const now = Date.now()
  const revoked = record.status === "revoked"
  const secret = record.kind === "secret"
  const cidrProblem = cidrEntryError(candidate, cidrs)
  const cidrsDirty = secret && !sameList(cidrs, record.allowedCidrs)
  const dirty = cidrsDirty || expiry !== "keep"

  const rename = useMutation({
    mutationFn: () => api.apiKeys.update(record.id, { name: name.trim() }),
    async onSuccess() {
      setRenaming(false)
      await onSaved()
      toast({ title: "Key renamed" })
    },
  })
  const save = useMutation({
    mutationFn: async () => {
      if (cidrsDirty) {
        await stepUp.run(() =>
          api.apiKeys.update(record.id, { allowedCidrs: cidrs }),
        )
      }
      if (expiry !== "keep") {
        const at =
          expiry === "now"
            ? new Date(now).toISOString()
            : (expiryFor(expiry, now) ?? new Date(now).toISOString())
        await stepUp.run(() => api.apiKeys.expire(record.id, at))
      }
    },
    async onSuccess() {
      await onSaved()
      toast({ title: "Key saved" })
    },
  })

  function addCidr(event: FormEvent): void {
    event.preventDefault()
    const entry = candidate.trim()
    if (entry === "" || cidrProblem !== null) return
    setCidrs((current) => [...current, entry])
    setCandidate("")
  }

  function submitRename(event: FormEvent): void {
    event.preventDefault()
    if (name.trim() !== "" && name.trim() !== record.name) rename.mutate()
  }

  return (
    <aside
      id={id}
      aria-label={`Key ${record.name}`}
      className="flex min-w-0 flex-col self-start rounded-lg border border-line bg-surface px-5 pb-5 pt-[18px]"
    >
      <div className="flex items-center gap-2 pb-1">
        <span className="text-caption text-muted">Selected key</span>
        <span className="flex-1" />
        <Button.Root
          variant="ghost"
          size="icon-sm"
          aria-label="Close key"
          onClick={onClose}
        >
          <X aria-hidden="true" size={15} strokeWidth={1.75} />
        </Button.Root>
      </div>
      {renaming ? (
        <form
          onSubmit={submitRename}
          className="flex items-center gap-2 pb-2.5"
          noValidate
        >
          <Input.Root
            aria-label="Key name"
            value={name}
            maxLength={80}
            autoFocus
            onChange={(event) => setName(event.target.value)}
          />
          <Button.Root
            type="submit"
            size="md"
            variant="secondary"
            loading={rename.isPending}
            disabled={name.trim() === "" || name.trim() === record.name}
          >
            Save
          </Button.Root>
          <Button.Root
            variant="ghost"
            size="icon-md"
            aria-label="Cancel rename"
            onClick={() => {
              setRenaming(false)
              setName(record.name)
            }}
          >
            <X aria-hidden="true" size={15} strokeWidth={1.75} />
          </Button.Root>
        </form>
      ) : (
        <div className="flex min-w-0 items-center gap-2 pb-2.5">
          <h2 className="min-w-0 truncate text-title-sm font-600 text-ink">
            {record.name}
          </h2>
          <KindPill kind={record.kind} />
          <span className="flex-1" />
          {revoked ? null : (
            <Button.Root
              variant="ghost"
              size="icon-sm"
              aria-label="Rename key"
              onClick={() => setRenaming(true)}
            >
              <Pencil aria-hidden="true" size={14} strokeWidth={1.75} />
            </Button.Root>
          )}
        </div>
      )}
      {rename.isError ? (
        <p role="alert" className="pb-2 text-label font-500 text-neg">
          {errorMessage(rename.error)}
        </p>
      ) : null}
      <dl className="m-0 flex flex-col">
        <PanelRow term="Prefix">
          <span className="font-mono">{record.displayPrefix}</span>
        </PanelRow>
        <PanelRow term="Environment">
          <span className="flex items-center gap-1.5">
            <StatusDot tone={environment.kind === "live" ? "pos" : "neutral"} />
            {environmentNames[environment.kind]}
          </span>
        </PanelRow>
        <PanelRow term="Created">
          {createdBy === null
            ? formatMonthDay(record.createdAt)
            : `${formatMonthDay(record.createdAt)} · ${shortName(createdBy)}`}
        </PanelRow>
        <PanelRow term="Last used">
          {keyLastUsed(record.lastUsedAt, now)}
        </PanelRow>
        <PanelRow term="Requests · 7 d">
          <span className="font-mono">{formatInteger(requests)}</span>
        </PanelRow>
        {revoked ? (
          <PanelRow term="Revoked">{formatMonthDay(record.revokedAt)}</PanelRow>
        ) : null}
      </dl>
      {revoked ? null : (
        <>
          {secret ? (
            <fieldset className="m-0 mt-[18px] flex min-w-0 flex-col gap-1.5 border-0 p-0">
              <legend className="flex items-center gap-1.5 pb-1.5 text-label font-600 text-ink-2">
                Allowed IPs
                <LockHint />
              </legend>
              {cidrs.length === 0 ? null : (
                <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                  {cidrs.map((cidr) => (
                    <li
                      key={cidr}
                      className="flex h-[34px] items-center gap-2 rounded-md bg-inset pl-3 pr-1"
                    >
                      <code className="min-w-0 flex-1 truncate font-mono text-label text-ink">
                        {cidr}
                      </code>
                      <Button.Root
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Remove ${cidr}`}
                        onClick={() =>
                          setCidrs((current) =>
                            current.filter((item) => item !== cidr),
                          )
                        }
                      >
                        <X aria-hidden="true" size={14} strokeWidth={1.75} />
                      </Button.Root>
                    </li>
                  ))}
                </ul>
              )}
              <form onSubmit={addCidr} className="flex gap-1.5" noValidate>
                <Input.Root
                  mono
                  aria-label="New allowed CIDR"
                  aria-invalid={cidrProblem !== null || undefined}
                  aria-describedby={`${fieldId}-cidr`}
                  placeholder="198.51.100.7/32"
                  autoComplete="off"
                  spellCheck={false}
                  value={candidate}
                  className="bg-surface text-label"
                  onChange={(event) => setCandidate(event.target.value)}
                />
                <Button.Root
                  type="submit"
                  variant="secondary"
                  disabled={candidate.trim() === "" || cidrProblem !== null}
                >
                  Add
                </Button.Root>
              </form>
              <p
                id={`${fieldId}-cidr`}
                className={cn(
                  "text-caption",
                  cidrProblem === null ? "text-muted" : "font-500 text-neg",
                )}
              >
                {cidrProblem ?? "Empty = any IP"}
              </p>
            </fieldset>
          ) : (
            <p className="mt-[18px] text-caption text-muted">
              Browser key · registered origins only
            </p>
          )}
          <Field.Root className="mt-4">
            <Field.Label className="flex items-center gap-1.5">
              Expires
              <LockHint />
            </Field.Label>
            <Select.Root
              value={expiry}
              onValueChange={(value) => {
                if (
                  value === "keep" ||
                  value === "now" ||
                  isExpiryChoice(value)
                )
                  setExpiry(value)
              }}
            >
              <Field.Control>
                <Select.Trigger size="lg" className="bg-surface">
                  <Select.Value />
                </Select.Trigger>
              </Field.Control>
              <Select.Content>
                <Select.Item value="keep">
                  {record.expiresAt === null
                    ? "Never"
                    : formatDate(record.expiresAt)}
                </Select.Item>
                {(["30d", "90d", "365d"] as const).map((choice) => (
                  <Select.Item key={choice} value={choice}>
                    {`${expiryChoices[choice].label} · ${formatDate(expiryFor(choice, now))}`}
                  </Select.Item>
                ))}
                <Select.Item value="now">Expire now</Select.Item>
              </Select.Content>
            </Select.Root>
            <Field.Description className="text-caption text-muted">
              Shortening needs no passkey
            </Field.Description>
          </Field.Root>
          <div className="mt-[18px] flex items-center gap-2">
            <Button.Root
              variant="ghost"
              disabled={!dirty || save.isPending}
              onClick={() => {
                setCidrs(record.allowedCidrs)
                setExpiry("keep")
                setCandidate("")
              }}
            >
              Discard
            </Button.Root>
            <span className="flex-1" />
            <Button.Root
              loading={save.isPending}
              disabled={!dirty}
              onClick={() => save.mutate()}
            >
              {save.isPending ? null : (
                <Lock aria-hidden="true" size={13} strokeWidth={2} />
              )}
              Save
            </Button.Root>
          </div>
          {save.isError && !isStepUpCancelled(save.error) ? (
            <p role="alert" className="pt-2 text-label font-500 text-neg">
              {errorMessage(save.error)}
            </p>
          ) : null}
          <div className="mt-4 flex items-center gap-2 border-t border-line pt-4">
            <Button.Root
              variant="secondary"
              disabled={record.status !== "active"}
              onClick={onRotate}
            >
              <RefreshCw aria-hidden="true" size={14} strokeWidth={1.75} />
              Rotate
            </Button.Root>
            <span className="flex-1" />
            <Button.Root
              variant="secondary"
              className="border-neg/30 text-neg hover:border-neg/50"
              onClick={onRevoke}
            >
              <Ban aria-hidden="true" size={14} strokeWidth={1.75} />
              Revoke
            </Button.Root>
          </div>
        </>
      )}
    </aside>
  )
}

type CreateBody = Parameters<typeof api.environments.createApiKey>[1]
type CreatedKey = Awaited<ReturnType<typeof api.environments.createApiKey>>

function CreateKeyDialog({
  environment,
  open,
  onOpenChange,
  onCreated,
  create,
}: {
  environment: Environment
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (result: CreatedKey) => Promise<void>
  create: (body: CreateBody) => Promise<CreatedKey>
}): ReactElement {
  const [kind, setKind] = useState<ApiKeyKind>("secret")
  const [name, setName] = useState("")
  const [expiry, setExpiry] = useState<ExpiryChoice>("never")
  const [cidrText, setCidrText] = useState("")
  const mutation = useMutation({
    mutationFn: (body: CreateBody) => create(body),
    async onSuccess(result) {
      setName("")
      setCidrText("")
      await onCreated(result)
    },
  })
  const { cidrs, invalid } = parseCidrList(cidrText)
  const cidrError =
    kind === "secret" && invalid.length > 0
      ? `Invalid CIDR: ${invalid.join(", ")}`
      : null
  const expiresAt = expiryFor(expiry, Date.now())

  function submit(event: FormEvent): void {
    event.preventDefault()
    if (name.trim() === "" || cidrError !== null) return
    mutation.mutate({
      kind,
      name: name.trim(),
      allowedCidrs: kind === "secret" ? cidrs : [],
      expiresAt: expiryFor(expiry, Date.now()),
    })
  }

  const issue = (path: string): string | null =>
    mutation.error instanceof ApiError ? mutation.error.issueFor(path) : null
  const generalError =
    mutation.isError &&
    !isStepUpCancelled(mutation.error) &&
    !(mutation.error instanceof ApiError && mutation.error.issues.length > 0)
      ? errorMessage(mutation.error)
      : null

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content size="md" aria-describedby={undefined} className="p-6">
        <Dialog.Header className="flex-row items-center gap-2.5">
          <Dialog.Title>New API key</Dialog.Title>
          <EnvPill kind={environment.kind} full />
        </Dialog.Header>
        <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
          <Fieldset.Root disabled={mutation.isPending}>
            <Fieldset.Legend hidden>Key</Fieldset.Legend>
            <Fieldset.Fields className="gap-5">
              <Field.Root>
                <Field.Label>Type</Field.Label>
                <Field.Control>
                  <SegmentedControl.Root
                    aria-label="Key type"
                    value={kind}
                    onValueChange={(value) =>
                      setKind(
                        value === "publishable" ? "publishable" : "secret",
                      )
                    }
                    className="grid w-full grid-cols-2"
                  >
                    <SegmentedControl.Item
                      value="secret"
                      className="text-body-sm"
                    >
                      Secret
                    </SegmentedControl.Item>
                    <SegmentedControl.Item
                      value="publishable"
                      className="text-body-sm"
                    >
                      Publishable
                    </SegmentedControl.Item>
                  </SegmentedControl.Root>
                </Field.Control>
                <Field.Description className="text-caption text-muted">
                  {kind === "secret"
                    ? "Server only · Origin header rejected"
                    : "Browser · registered origins only"}
                </Field.Description>
              </Field.Root>
              <Field.Root required>
                <Field.Label>Name</Field.Label>
                <Field.Control>
                  <Input.Root
                    size="lg"
                    value={name}
                    maxLength={80}
                    autoComplete="off"
                    placeholder="Production server"
                    className="bg-surface"
                    onChange={(event) => setName(event.target.value)}
                  />
                </Field.Control>
                <Field.Error>{issue("name")}</Field.Error>
              </Field.Root>
              <Field.Root>
                <span className="flex items-center gap-2">
                  <Field.Label>Expires</Field.Label>
                  <span className="flex-1" />
                  <span className="font-mono text-caption text-secondary">
                    {expiresAt === null ? "Never" : formatDate(expiresAt)}
                  </span>
                </span>
                <Field.Control>
                  <SegmentedControl.Root
                    aria-label="Expires"
                    value={expiry}
                    onValueChange={(value) => {
                      if (isExpiryChoice(value)) setExpiry(value)
                    }}
                    className="grid w-full grid-cols-4"
                  >
                    {(Object.keys(expiryChoices) as ExpiryChoice[]).map(
                      (choice) => (
                        <SegmentedControl.Item
                          key={choice}
                          value={choice}
                          className="text-body-sm"
                        >
                          {expiryChoices[choice].label}
                        </SegmentedControl.Item>
                      ),
                    )}
                  </SegmentedControl.Root>
                </Field.Control>
              </Field.Root>
              {kind === "secret" ? (
                <Field.Root invalid={cidrError !== null}>
                  <span className="flex items-center gap-1.5">
                    <Field.Label>Allowed IPs</Field.Label>
                    <span className="text-caption text-muted">Optional</span>
                  </span>
                  <Field.Control>
                    <Textarea.Root
                      mono
                      rows={3}
                      placeholder={"203.0.113.0/24\n2001:db8::/48"}
                      value={cidrText}
                      className="bg-surface"
                      onChange={(event) => setCidrText(event.target.value)}
                    />
                  </Field.Control>
                  <Field.Description className="text-caption text-muted">
                    One per line · empty = any IP
                  </Field.Description>
                  <Field.Error>
                    {cidrError ?? issue("allowedCidrs")}
                  </Field.Error>
                </Field.Root>
              ) : null}
            </Fieldset.Fields>
          </Fieldset.Root>
          {generalError === null ? null : (
            <p role="alert" className="text-label font-500 text-neg">
              {generalError}
            </p>
          )}
          <div className="flex items-center gap-2 border-t border-line pt-5">
            <LockHint />
            <span className="flex-1" />
            <Dialog.Close asChild>
              <Button.Root variant="secondary">Cancel</Button.Root>
            </Dialog.Close>
            <Button.Root
              type="submit"
              loading={mutation.isPending}
              disabled={name.trim() === "" || cidrError !== null}
            >
              {mutation.isPending ? null : (
                <Lock aria-hidden="true" size={13} strokeWidth={2} />
              )}
              Create key
            </Button.Root>
          </div>
        </form>
      </Dialog.Content>
    </Dialog.Root>
  )
}

const overlapOptions = {
  "0": "Immediately",
  "3600": "1 hour",
  "86400": "24 hours",
  "604800": "7 days",
} as const

type OverlapOption = keyof typeof overlapOptions

function isOverlapOption(value: string): value is OverlapOption {
  return value in overlapOptions
}

type RotatedKey = Awaited<ReturnType<typeof api.apiKeys.rotate>>

function RotateKeyDialog({
  apiKey,
  onClose,
  rotate,
  onRotated,
}: {
  apiKey: ApiKeyRecord | null
  onClose: () => void
  rotate: (key: ApiKeyRecord, overlapSeconds: number) => Promise<RotatedKey>
  onRotated: (result: RotatedKey) => Promise<void>
}): ReactElement {
  const [overlap, setOverlap] = useState<OverlapOption>("86400")
  const mutation = useMutation({
    mutationFn: (key: ApiKeyRecord) => rotate(key, Number(overlap)),
    onSuccess: (result) => onRotated(result),
  })

  function submit(event: FormEvent): void {
    event.preventDefault()
    if (apiKey !== null) mutation.mutate(apiKey)
  }

  return (
    <Dialog.Root
      open={apiKey !== null}
      onOpenChange={(open) => {
        if (!open) {
          mutation.reset()
          onClose()
        }
      }}
    >
      <Dialog.Content size="sm">
        <Dialog.Header>
          <Dialog.Title>Rotate key</Dialog.Title>
          <Dialog.Description className="font-mono text-label">
            {apiKey?.displayPrefix}
          </Dialog.Description>
        </Dialog.Header>
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <Fieldset.Root disabled={mutation.isPending}>
            <Fieldset.Legend hidden>Rotation</Fieldset.Legend>
            <Fieldset.Fields>
              <Field.Root>
                <Field.Label>Old key expires</Field.Label>
                <Select.Root
                  value={overlap}
                  onValueChange={(value) => {
                    if (isOverlapOption(value)) setOverlap(value)
                  }}
                >
                  <Field.Control>
                    <Select.Trigger>
                      <Select.Value />
                    </Select.Trigger>
                  </Field.Control>
                  <Select.Content>
                    {Object.entries(overlapOptions).map(([value, label]) => (
                      <Select.Item key={value} value={value}>
                        {label}
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select.Root>
                <Field.Error>
                  {mutation.isError && !isStepUpCancelled(mutation.error)
                    ? errorMessage(mutation.error)
                    : null}
                </Field.Error>
              </Field.Root>
            </Fieldset.Fields>
          </Fieldset.Root>
          <Dialog.Footer className="items-center">
            <LockHint className="mr-auto hidden sm:inline-flex" />
            <Dialog.Close asChild>
              <Button.Root variant="secondary">Cancel</Button.Root>
            </Dialog.Close>
            <Button.Root type="submit" loading={mutation.isPending}>
              {mutation.isPending ? null : (
                <RefreshCw aria-hidden="true" size={13} strokeWidth={2} />
              )}
              Rotate
            </Button.Root>
          </Dialog.Footer>
        </form>
      </Dialog.Content>
    </Dialog.Root>
  )
}
