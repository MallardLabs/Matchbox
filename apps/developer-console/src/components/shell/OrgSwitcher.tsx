import * as Button from "@repo/ui/button"
import { cn } from "@repo/ui/cn"
import * as Dialog from "@repo/ui/dialog"
import * as DropdownMenu from "@repo/ui/dropdown-menu"
import * as Field from "@repo/ui/field"
import * as Fieldset from "@repo/ui/fieldset"
import * as Input from "@repo/ui/input"
import * as Toast from "@repo/ui/toast"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { Check, ChevronsUpDown, Plus } from "lucide-react"
import { type FormEvent, type ReactElement, useState } from "react"
import * as api from "../../lib/api"
import { errorMessage } from "../../lib/api-client"
import { humanize } from "../../lib/format"
import { keys } from "../../lib/queries"
import { useSession } from "../../lib/session"
import AppMark from "../ui/AppMark"

/**
 * Organization picker. `sidebar`: the card in the sidebar footer.
 * `compact`: the monogram alone (icon rail, phone top bar).
 */
export default function OrgSwitcher({
  variant = "sidebar",
  className,
}: {
  variant?: "sidebar" | "compact"
  className?: string | undefined
}): ReactElement {
  const { me, org, selectOrg } = useSession()
  const [creating, setCreating] = useState(false)
  const name = org?.name ?? "No organization"
  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger
          className={cn(
            variant === "sidebar"
              ? "flex w-full min-w-0 items-center gap-2.5 rounded-lg border border-line bg-surface p-2.5 text-left transition-colors hover:border-line-2"
              : "flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-inset",
            className,
          )}
          aria-label={
            org === null ? "Select organization" : `Organization: ${org.name}`
          }
        >
          <AppMark name={name} tone="ink" size="sm" />
          {variant === "sidebar" ? (
            <>
              <span className="flex min-w-0 flex-1 flex-col gap-px">
                <span className="truncate text-body-sm font-600 text-ink">
                  {name}
                </span>
                {org === null ? null : (
                  <span className="text-caption text-muted">
                    {humanize(org.role)}
                  </span>
                )}
              </span>
              <ChevronsUpDown
                aria-hidden="true"
                size={14}
                strokeWidth={1.75}
                className="shrink-0 text-muted"
              />
            </>
          ) : null}
        </DropdownMenu.Trigger>
        <DropdownMenu.Content
          align="start"
          side={variant === "sidebar" ? "top" : "bottom"}
          className="w-[244px]"
        >
          <DropdownMenu.Label>Organizations</DropdownMenu.Label>
          {me.organizations.map((item) => (
            <DropdownMenu.Item
              key={item.id}
              onSelect={() => selectOrg(item.id)}
            >
              <span className="min-w-0 flex-1 truncate">{item.name}</span>
              {item.id === org?.id ? (
                <Check
                  aria-label="Selected"
                  size={14}
                  strokeWidth={2}
                  className="text-accent-ink"
                />
              ) : null}
            </DropdownMenu.Item>
          ))}
          <DropdownMenu.Separator />
          <DropdownMenu.Item onSelect={() => setCreating(true)}>
            <Plus aria-hidden="true" size={14} strokeWidth={1.75} />
            New organization
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Root>
      <CreateOrgDialog open={creating} onOpenChange={setCreating} />
    </>
  )
}

function CreateOrgDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}): ReactElement {
  const [name, setName] = useState("")
  const queryClient = useQueryClient()
  const { selectOrg } = useSession()
  const { toast } = Toast.useToast()
  const navigate = useNavigate()
  const create = useMutation({
    mutationFn: (value: string) => api.orgs.create({ name: value }),
    async onSuccess(organization) {
      await queryClient.invalidateQueries({ queryKey: keys.me })
      await queryClient.invalidateQueries({ queryKey: keys.orgs })
      selectOrg(organization.id)
      toast({ title: "Organization created" })
      onOpenChange(false)
      setName("")
      await navigate({ to: "/" })
    },
  })

  function submit(event: FormEvent): void {
    event.preventDefault()
    if (name.trim() === "") return
    create.mutate(name.trim())
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content size="sm" aria-describedby={undefined}>
        <Dialog.Header>
          <Dialog.Title>New organization</Dialog.Title>
        </Dialog.Header>
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <Fieldset.Root disabled={create.isPending}>
            <Fieldset.Legend hidden>Organization</Fieldset.Legend>
            <Fieldset.Fields>
              <Field.Root required>
                <Field.Label>Name</Field.Label>
                <Field.Control>
                  <Input.Root
                    value={name}
                    maxLength={80}
                    autoComplete="organization"
                    onChange={(event) => setName(event.target.value)}
                  />
                </Field.Control>
                <Field.Error>
                  {create.isError ? errorMessage(create.error) : null}
                </Field.Error>
              </Field.Root>
            </Fieldset.Fields>
          </Fieldset.Root>
          <Dialog.Footer>
            <Dialog.Close asChild>
              <Button.Root variant="secondary">Cancel</Button.Root>
            </Dialog.Close>
            <Button.Root
              type="submit"
              loading={create.isPending}
              disabled={name.trim() === ""}
            >
              Create
            </Button.Root>
          </Dialog.Footer>
        </form>
      </Dialog.Content>
    </Dialog.Root>
  )
}
