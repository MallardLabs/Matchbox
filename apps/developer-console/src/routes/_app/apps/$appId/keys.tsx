import type {
  ApiKeyRecord,
  Environment,
} from "@repo/platform-contracts/console"
import type { ApiKeyKind } from "@repo/platform-contracts/credentials"
import * as Badge from "@repo/ui/badge"
import * as Button from "@repo/ui/button"
import * as Dialog from "@repo/ui/dialog"
import * as DropdownMenu from "@repo/ui/dropdown-menu"
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
import { MoreHorizontal, Plus } from "lucide-react"
import { type FormEvent, type ReactElement, useState } from "react"
import { CredentialBadge, EnvBadge } from "../../../../components/Badges"
import ConfirmDialog from "../../../../components/ConfirmDialog"
import EnvironmentGate from "../../../../components/EnvironmentGate"
import QueryError from "../../../../components/QueryError"
import RevealSecretDialog from "../../../../components/RevealSecretDialog"
import * as api from "../../../../lib/api"
import { ApiError, errorMessage } from "../../../../lib/api-client"
import { useAppRoute } from "../../../../lib/app-route"
import { parseCidrList } from "../../../../lib/cidr"
import { formatDate, formatRelative } from "../../../../lib/format"
import { apiKeysQuery, keys } from "../../../../lib/queries"
import { isStepUpCancelled, useStepUp } from "../../../../lib/step-up"

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

function KeysPanel({
  environment,
}: { environment: Environment }): ReactElement {
  const list = useQuery(apiKeysQuery(environment.id))
  const [creating, setCreating] = useState(false)
  const [revealed, setRevealed] = useState<string | null>(null)
  const [rotating, setRotating] = useState<ApiKeyRecord | null>(null)
  const [revoking, setRevoking] = useState<ApiKeyRecord | null>(null)
  const queryClient = useQueryClient()
  const stepUp = useStepUp()
  const { toast } = Toast.useToast()

  async function refresh(): Promise<void> {
    await queryClient.invalidateQueries({
      queryKey: keys.apiKeys(environment.id),
    })
  }

  async function revoke(key: ApiKeyRecord): Promise<void> {
    await api.apiKeys.revoke(key.id)
    await refresh()
    toast({ title: "Key revoked" })
  }

  const header = (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-[14px] font-600 text-ink">API keys</h2>
      <Button.Root onClick={() => setCreating(true)}>
        <Plus aria-hidden="true" size={13} strokeWidth={2} />
        New key
      </Button.Root>
    </header>
  )

  let body: ReactElement
  if (list.isPending) {
    body = (
      <div aria-busy="true" className="flex flex-col gap-3">
        {["a", "b", "c"].map((key) => (
          <Skeleton.Root key={key} shape="block" />
        ))}
      </div>
    )
  } else if (list.isError) {
    body = <QueryError error={list.error} onRetry={() => void list.refetch()} />
  } else if (list.data.data.length === 0) {
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
      <Table.Root density="compact">
        <Table.Header>
          <Table.Row>
            <Table.Head>Name</Table.Head>
            <Table.Head>Type</Table.Head>
            <Table.Head className="hidden sm:table-cell">Env</Table.Head>
            <Table.Head>Prefix</Table.Head>
            <Table.Head className="hidden lg:table-cell">Created</Table.Head>
            <Table.Head className="hidden md:table-cell">Last used</Table.Head>
            <Table.Head className="hidden lg:table-cell">Expires</Table.Head>
            <Table.Head>Status</Table.Head>
            <Table.Head>
              <span className="sr-only">Actions</span>
            </Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {list.data.data.map((key) => (
            <Table.Row key={key.id}>
              <Table.Cell className="max-w-[180px] truncate font-600">
                {key.name}
              </Table.Cell>
              <Table.Cell>
                <Badge.Root tone={key.kind === "secret" ? "warn" : "neutral"}>
                  {key.kind === "secret" ? "Secret" : "Publishable"}
                </Badge.Root>
              </Table.Cell>
              <Table.Cell className="hidden sm:table-cell">
                <EnvBadge kind={environment.kind} />
              </Table.Cell>
              <Table.Cell mono className="text-[11px]">
                {key.displayPrefix}
              </Table.Cell>
              <Table.Cell className="hidden text-secondary lg:table-cell">
                {formatDate(key.createdAt)}
              </Table.Cell>
              <Table.Cell className="hidden text-secondary md:table-cell">
                {formatRelative(key.lastUsedAt)}
              </Table.Cell>
              <Table.Cell className="hidden text-secondary lg:table-cell">
                {key.expiresAt === null ? "Never" : formatDate(key.expiresAt)}
              </Table.Cell>
              <Table.Cell>
                <CredentialBadge status={key.status} />
              </Table.Cell>
              <Table.Cell className="text-right">
                {key.status === "revoked" ? null : (
                  <DropdownMenu.Root>
                    <DropdownMenu.Trigger asChild>
                      <Button.Root
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Actions for ${key.name}`}
                      >
                        <MoreHorizontal
                          aria-hidden="true"
                          size={15}
                          strokeWidth={1.75}
                        />
                      </Button.Root>
                    </DropdownMenu.Trigger>
                    <DropdownMenu.Content>
                      <DropdownMenu.Item
                        disabled={key.status !== "active"}
                        onSelect={() => setRotating(key)}
                      >
                        Rotate
                      </DropdownMenu.Item>
                      <DropdownMenu.Item
                        tone="danger"
                        onSelect={() => setRevoking(key)}
                      >
                        Revoke
                      </DropdownMenu.Item>
                    </DropdownMenu.Content>
                  </DropdownMenu.Root>
                )}
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>
    )
  }

  return (
    <section className="flex flex-col gap-4" aria-label="API keys">
      {header}
      {body}
      <CreateKeyDialog
        environment={environment}
        open={creating}
        onOpenChange={setCreating}
        onCreated={async (key) => {
          setCreating(false)
          setRevealed(key)
          await refresh()
        }}
        create={(body) =>
          stepUp.run(() => api.environments.createApiKey(environment.id, body))
        }
      />
      <RotateKeyDialog
        apiKey={rotating}
        onClose={() => setRotating(null)}
        rotate={(key, overlapSeconds) =>
          stepUp.run(() => api.apiKeys.rotate(key.id, overlapSeconds))
        }
        onRotated={async (key) => {
          setRotating(null)
          setRevealed(key)
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
          if (revoking !== null) await revoke(revoking)
        }}
      />
      <RevealSecretDialog
        noun="key"
        secret={revealed}
        title="API key"
        label="API key"
        onDone={() => {
          setRevealed(null)
          toast({ title: "Key ready" })
        }}
      />
    </section>
  )
}

const expiryOptions = {
  never: { label: "Never", days: null },
  "30d": { label: "30 days", days: 30 },
  "90d": { label: "90 days", days: 90 },
  "365d": { label: "1 year", days: 365 },
} as const

type ExpiryOption = keyof typeof expiryOptions

function isExpiryOption(value: string): value is ExpiryOption {
  return value in expiryOptions
}

type CreateBody = Parameters<typeof api.environments.createApiKey>[1]

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
  onCreated: (key: string) => Promise<void>
  create: (body: CreateBody) => Promise<{ key: string }>
}): ReactElement {
  const [kind, setKind] = useState<ApiKeyKind>("publishable")
  const [name, setName] = useState("")
  const [expiry, setExpiry] = useState<ExpiryOption>("never")
  const [cidrText, setCidrText] = useState("")
  const mutation = useMutation({
    mutationFn: (body: CreateBody) => create(body),
    async onSuccess(result) {
      setName("")
      setCidrText("")
      await onCreated(result.key)
    },
  })
  const { cidrs, invalid } = parseCidrList(cidrText)
  const cidrError =
    kind === "secret" && invalid.length > 0
      ? `Invalid CIDR: ${invalid.join(", ")}`
      : null

  function submit(event: FormEvent): void {
    event.preventDefault()
    if (name.trim() === "" || cidrError !== null) return
    const days = expiryOptions[expiry].days
    mutation.mutate({
      kind,
      name: name.trim(),
      allowedCidrs: kind === "secret" ? cidrs : [],
      expiresAt:
        days === null
          ? null
          : new Date(Date.now() + days * 86_400_000).toISOString(),
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
      <Dialog.Content size="md">
        <Dialog.Header>
          <Dialog.Title>New API key</Dialog.Title>
          <Dialog.Description>
            {environment.kind === "live"
              ? "Live · Mezo"
              : "Test · Mezo Testnet"}
          </Dialog.Description>
        </Dialog.Header>
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <Fieldset.Root disabled={mutation.isPending}>
            <Fieldset.Legend hidden>Key</Fieldset.Legend>
            <Fieldset.Fields>
              <Field.Root>
                <Field.Label>Type</Field.Label>
                <Field.Control>
                  <SegmentedControl.Root
                    aria-label="Key type"
                    value={kind}
                    onValueChange={(value) =>
                      setKind(value === "secret" ? "secret" : "publishable")
                    }
                    className="self-start"
                  >
                    <SegmentedControl.Item value="publishable">
                      Publishable
                    </SegmentedControl.Item>
                    <SegmentedControl.Item value="secret">
                      Secret
                    </SegmentedControl.Item>
                  </SegmentedControl.Root>
                </Field.Control>
                <Field.Description>
                  {kind === "secret"
                    ? "Server only · rejected with an Origin header"
                    : "Browser · registered origins only"}
                </Field.Description>
              </Field.Root>
              <Field.Root required>
                <Field.Label>Name</Field.Label>
                <Field.Control>
                  <Input.Root
                    value={name}
                    maxLength={80}
                    autoComplete="off"
                    placeholder="Production server"
                    onChange={(event) => setName(event.target.value)}
                  />
                </Field.Control>
                <Field.Error>{issue("name")}</Field.Error>
              </Field.Root>
              <Field.Root>
                <Field.Label>Expires</Field.Label>
                <Select.Root
                  value={expiry}
                  onValueChange={(value) => {
                    if (isExpiryOption(value)) setExpiry(value)
                  }}
                >
                  <Field.Control>
                    <Select.Trigger>
                      <Select.Value />
                    </Select.Trigger>
                  </Field.Control>
                  <Select.Content>
                    {Object.entries(expiryOptions).map(([value, option]) => (
                      <Select.Item key={value} value={value}>
                        {option.label}
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select.Root>
              </Field.Root>
              {kind === "secret" ? (
                <Field.Root invalid={cidrError !== null}>
                  <Field.Label>Allowed CIDRs</Field.Label>
                  <Field.Control>
                    <Textarea.Root
                      mono
                      rows={3}
                      placeholder={"203.0.113.0/24\n2001:db8::/48"}
                      value={cidrText}
                      onChange={(event) => setCidrText(event.target.value)}
                    />
                  </Field.Control>
                  <Field.Description>
                    One per line · empty allows any IP
                  </Field.Description>
                  <Field.Error>
                    {cidrError ?? issue("allowedCidrs")}
                  </Field.Error>
                </Field.Root>
              ) : null}
            </Fieldset.Fields>
          </Fieldset.Root>
          {generalError === null ? null : (
            <p role="alert" className="text-[12px] font-500 text-neg">
              {generalError}
            </p>
          )}
          <Dialog.Footer>
            <Dialog.Close asChild>
              <Button.Root variant="secondary">Cancel</Button.Root>
            </Dialog.Close>
            <Button.Root
              type="submit"
              loading={mutation.isPending}
              disabled={name.trim() === "" || cidrError !== null}
            >
              Create key
            </Button.Root>
          </Dialog.Footer>
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

function RotateKeyDialog({
  apiKey,
  onClose,
  rotate,
  onRotated,
}: {
  apiKey: ApiKeyRecord | null
  onClose: () => void
  rotate: (
    key: ApiKeyRecord,
    overlapSeconds: number,
  ) => Promise<{ key: string }>
  onRotated: (key: string) => Promise<void>
}): ReactElement {
  const [overlap, setOverlap] = useState<OverlapOption>("86400")
  const mutation = useMutation({
    mutationFn: (key: ApiKeyRecord) => rotate(key, Number(overlap)),
    onSuccess: (result) => onRotated(result.key),
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
          <Dialog.Description className="font-mono text-[12px]">
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
          <Dialog.Footer>
            <Dialog.Close asChild>
              <Button.Root variant="secondary">Cancel</Button.Root>
            </Dialog.Close>
            <Button.Root type="submit" loading={mutation.isPending}>
              Rotate
            </Button.Root>
          </Dialog.Footer>
        </form>
      </Dialog.Content>
    </Dialog.Root>
  )
}
