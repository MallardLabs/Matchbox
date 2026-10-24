import {
  Box,
  KeyRound,
  LayoutGrid,
  MoreHorizontal,
  Plus,
  Search,
  Settings,
  Trash2,
} from "lucide-react"
import { type ReactElement, type ReactNode, useState } from "react"
import * as AlertDialog from "./alert-dialog"
import * as AppShell from "./app-shell"
import * as Badge from "./badge"
import * as Button from "./button"
import * as Card from "./card"
import * as Checkbox from "./checkbox"
import * as CodeBlock from "./code-block"
import * as CopyField from "./copy-field"
import * as Dialog from "./dialog"
import * as DropdownMenu from "./dropdown-menu"
import * as EmptyState from "./empty-state"
import * as Field from "./field"
import * as Fieldset from "./fieldset"
import * as Input from "./input"
import * as KeyValue from "./key-value"
import * as Logo from "./logo"
import * as PageHeader from "./page-header"
import * as SegmentedControl from "./segmented-control"
import * as Select from "./select"
import * as Skeleton from "./skeleton"
import * as Switch from "./switch"
import * as Table from "./table"
import * as Tabs from "./tabs"
import * as Textarea from "./textarea"
import * as Toast from "./toast"
import * as Tooltip from "./tooltip"
import * as WalletAddress from "./wallet-address"

const ADDRESS = "0x8f3cf7ad23cd3cadbd9735aff958023239c6a063"

const CURL =
  'curl https://api.matchbox.markets/v1/gauge-profiles \\\n  -H "Authorization: Bearer $MATCHBOX_KEY"'

const snippets: [CodeBlock.CodeSnippet, ...CodeBlock.CodeSnippet[]] = [
  {
    language: "ts",
    label: "TypeScript",
    code: 'import { createMatchboxClient } from "@matchbox-markets/sdk"\n\nconst client = createMatchboxClient({ apiKey: process.env.MATCHBOX_KEY })\nconst page = await client.gaugeProfiles.list({ limit: 20 })',
  },
  {
    language: "curl",
    label: "curl",
    code: CURL,
  },
]

function Section({
  title,
  children,
}: {
  title: string
  children: ReactNode
}): ReactElement {
  return (
    <section className="flex flex-col gap-3 border-t border-line pt-5">
      <h2 className="text-[11px] font-650 uppercase tracking-[0.04em] text-secondary">
        {title}
      </h2>
      {children}
    </section>
  )
}

function Row({ children }: { children: ReactNode }): ReactElement {
  return <div className="flex flex-wrap items-center gap-2">{children}</div>
}

function ToastDemo(): ReactElement {
  const { toast } = Toast.useToast()
  return (
    <Row>
      <Button.Root
        variant="secondary"
        onClick={() => toast({ title: "Redirect URI saved" })}
      >
        Success toast
      </Button.Root>
      <Button.Root
        variant="secondary"
        onClick={() =>
          toast({
            title: "Key revoked",
            tone: "neutral",
            action: {
              label: "Undo",
              altText: "Restore the key from the keys list",
              onAction: () => {},
            },
          })
        }
      >
        With action
      </Button.Root>
      <Button.Root
        variant="secondary"
        onClick={() =>
          toast({
            title: "Request failed",
            description: "req_01J9Z3",
            tone: "error",
          })
        }
      >
        Error toast
      </Button.Root>
    </Row>
  )
}

function Gallery({ theme }: { theme: "light" | "dark" }): ReactElement {
  const [environment, setEnvironment] = useState("test")
  const [density, setDensity] = useState("comfortable")
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const id = (name: string): string => `${theme}-${name}`

  return (
    <div className="flex flex-col gap-6">
      <PageHeader.Root>
        <PageHeader.Heading>
          <PageHeader.Eyebrow>{theme}</PageHeader.Eyebrow>
          <PageHeader.Title>Components</PageHeader.Title>
          <PageHeader.Description>@repo/ui</PageHeader.Description>
        </PageHeader.Heading>
        <PageHeader.Actions>
          <Button.Root variant="secondary" size="sm">
            Docs
          </Button.Root>
          <Button.Root size="sm">
            <Plus aria-hidden="true" size={13} strokeWidth={2} />
            New app
          </Button.Root>
        </PageHeader.Actions>
      </PageHeader.Root>

      <Section title="Logo">
        <Row>
          <Logo.Root />
          <Logo.Root variant="icon" />
        </Row>
      </Section>

      <Section title="Button">
        <Row>
          <Button.Root>Primary</Button.Root>
          <Button.Root variant="secondary">Secondary</Button.Root>
          <Button.Root variant="ghost">Ghost</Button.Root>
          <Button.Root variant="soft">Soft</Button.Root>
          <Button.Root variant="danger">Danger</Button.Root>
        </Row>
        <Row>
          <Button.Root size="sm">Small</Button.Root>
          <Button.Root size="md">Medium</Button.Root>
          <Button.Root size="lg">Large</Button.Root>
          <Button.Root size="icon-md" variant="ghost" aria-label="Settings">
            <Settings aria-hidden="true" size={16} strokeWidth={1.75} />
          </Button.Root>
        </Row>
        <Row>
          <Button.Root
            loading={loading}
            onClick={() => {
              setLoading(true)
              window.setTimeout(() => setLoading(false), 1500)
            }}
          >
            {loading ? "Saving" : "Save"}
          </Button.Root>
          <Button.Root variant="secondary" disabled>
            Disabled
          </Button.Root>
          <Button.Root asChild variant="secondary">
            <a href="#showcase">Link as button</a>
          </Button.Root>
        </Row>
      </Section>

      <Section title="Form">
        <form
          className="flex max-w-md flex-col gap-5"
          onSubmit={(event) => event.preventDefault()}
        >
          <Fieldset.Root>
            <Fieldset.Legend>App</Fieldset.Legend>
            <Fieldset.Fields>
              <Field.Root required>
                <Field.Label>Name</Field.Label>
                <Field.Control>
                  <Input.Root placeholder="Gauge explorer" />
                </Field.Control>
              </Field.Root>
              <Field.Root>
                <Field.Label>Website</Field.Label>
                <Field.Control>
                  <Input.Root type="url" mono defaultValue="http://example" />
                </Field.Control>
                <Field.Error>Use an https:// URL</Field.Error>
              </Field.Root>
              <Field.Root>
                <Field.Label>Search</Field.Label>
                <Input.Group>
                  <Input.Adornment>
                    <Search aria-hidden="true" size={14} strokeWidth={1.75} />
                  </Input.Adornment>
                  <Field.Control>
                    <Input.Root type="search" placeholder="Apps or keys" />
                  </Field.Control>
                </Input.Group>
              </Field.Root>
              <Field.Root disabled>
                <Field.Label>Client ID</Field.Label>
                <Field.Control>
                  <Input.Root mono defaultValue="mbx_client_4f2a" />
                </Field.Control>
              </Field.Root>
              <Field.Root>
                <Field.Label>Description</Field.Label>
                <Field.Control>
                  <Textarea.Root rows={3} />
                </Field.Control>
                <Field.Description>
                  Shown on the consent screen
                </Field.Description>
              </Field.Root>
              <Field.Root>
                <Field.Label>Network</Field.Label>
                <Select.Root defaultValue="testnet">
                  <Field.Control>
                    <Select.Trigger>
                      <Select.Value />
                    </Select.Trigger>
                  </Field.Control>
                  <Select.Content>
                    <Select.Item value="testnet">Mezo testnet</Select.Item>
                    <Select.Item value="mainnet">Mezo mainnet</Select.Item>
                  </Select.Content>
                </Select.Root>
              </Field.Root>
            </Fieldset.Fields>
          </Fieldset.Root>
          <Fieldset.Root>
            <Fieldset.Legend>Scopes</Fieldset.Legend>
            <Fieldset.Fields className="gap-2.5">
              <Field.Root orientation="horizontal">
                <Field.Control>
                  <Checkbox.Root defaultChecked />
                </Field.Control>
                <Field.Label>gauge-profiles:read</Field.Label>
              </Field.Root>
              <Field.Root orientation="horizontal">
                <Field.Control>
                  <Checkbox.Root />
                </Field.Control>
                <Field.Label>discord:read</Field.Label>
                <Field.Description>Requires review</Field.Description>
              </Field.Root>
              <Field.Root orientation="horizontal" disabled>
                <Field.Control>
                  <Checkbox.Root checked="indeterminate" />
                </Field.Control>
                <Field.Label>Mixed</Field.Label>
              </Field.Root>
              <Field.Root orientation="horizontal">
                <Field.Control>
                  <Switch.Root defaultChecked />
                </Field.Control>
                <Field.Label>Enabled</Field.Label>
              </Field.Root>
              <Field.Root orientation="horizontal">
                <Field.Control>
                  <Switch.Root />
                </Field.Control>
                <Field.Label>Allow localhost</Field.Label>
              </Field.Root>
            </Fieldset.Fields>
          </Fieldset.Root>
        </form>
      </Section>

      <Section title="Badge">
        <Row>
          <Badge.Root>Draft</Badge.Root>
          <Badge.Root tone="accent">Live</Badge.Root>
          <Badge.Root tone="pos" dot>
            Approved
          </Badge.Root>
          <Badge.Root tone="warn" dot>
            In review
          </Badge.Root>
          <Badge.Root tone="neg" dot>
            Revoked
          </Badge.Root>
          <Badge.Root mono tone="accent">
            #1204
          </Badge.Root>
        </Row>
      </Section>

      <Section title="Segmented control and tabs">
        <SegmentedControl.Root
          aria-label="Environment"
          value={environment}
          onValueChange={setEnvironment}
        >
          <SegmentedControl.Item value="test">Test</SegmentedControl.Item>
          <SegmentedControl.Item value="live">Live</SegmentedControl.Item>
        </SegmentedControl.Root>
        <Tabs.Root defaultValue="credentials">
          <Tabs.List aria-label="Environment sections">
            <Tabs.Trigger value="credentials">Credentials</Tabs.Trigger>
            <Tabs.Trigger value="redirects">Redirect URIs</Tabs.Trigger>
            <Tabs.Trigger value="scopes">Scopes</Tabs.Trigger>
          </Tabs.List>
          <Tabs.Content value="credentials">
            <KeyValue.Root>
              <KeyValue.Item>
                <KeyValue.Term>Client ID</KeyValue.Term>
                <KeyValue.Value mono>mbx_client_4f2a9c</KeyValue.Value>
              </KeyValue.Item>
              <KeyValue.Item>
                <KeyValue.Term>Created</KeyValue.Term>
                <KeyValue.Value>Sep 30, 2026</KeyValue.Value>
              </KeyValue.Item>
              <KeyValue.Item>
                <KeyValue.Term>Last used</KeyValue.Term>
                <KeyValue.Value>{null}</KeyValue.Value>
              </KeyValue.Item>
            </KeyValue.Root>
          </Tabs.Content>
          <Tabs.Content value="redirects">
            <CopyField.Root
              label="redirect URI"
              value="https://example.com/oauth/callback"
            />
          </Tabs.Content>
          <Tabs.Content value="scopes">
            <KeyValue.Root layout="stacked">
              <KeyValue.Item>
                <KeyValue.Term>Approved</KeyValue.Term>
                <KeyValue.Value mono>gauge-profiles:read</KeyValue.Value>
              </KeyValue.Item>
              <KeyValue.Item>
                <KeyValue.Term>Pending</KeyValue.Term>
                <KeyValue.Value />
              </KeyValue.Item>
            </KeyValue.Root>
          </Tabs.Content>
        </Tabs.Root>
      </Section>

      <Section title="Card">
        <Card.Root>
          <Card.Header>
            <Card.Title>API keys</Card.Title>
            <Card.Actions>
              <SegmentedControl.Root
                aria-label="Density"
                size="sm"
                value={density}
                onValueChange={setDensity}
              >
                <SegmentedControl.Item value="comfortable">
                  Comfortable
                </SegmentedControl.Item>
                <SegmentedControl.Item value="compact">
                  Compact
                </SegmentedControl.Item>
              </SegmentedControl.Root>
            </Card.Actions>
          </Card.Header>
          <Card.Body>
            <Table.Root
              density={density === "compact" ? "compact" : "comfortable"}
              className="min-w-[560px]"
            >
              <Table.Header>
                <Table.Row>
                  <Table.Head>Name</Table.Head>
                  <Table.Head>Prefix</Table.Head>
                  <Table.Head numeric>Requests 24h</Table.Head>
                  <Table.Head>Status</Table.Head>
                  <Table.Head>
                    <span className="sr-only">Actions</span>
                  </Table.Head>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                <Table.Row>
                  <Table.Cell>Production</Table.Cell>
                  <Table.Cell mono>mbx_sk_live_9f2…</Table.Cell>
                  <Table.Cell numeric>12,408</Table.Cell>
                  <Table.Cell>
                    <Badge.Root tone="pos" dot>
                      Active
                    </Badge.Root>
                  </Table.Cell>
                  <Table.Cell className="text-right">
                    <DropdownMenu.Root>
                      <DropdownMenu.Trigger asChild>
                        <Button.Root
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Production key actions"
                        >
                          <MoreHorizontal
                            aria-hidden="true"
                            size={16}
                            strokeWidth={1.75}
                          />
                        </Button.Root>
                      </DropdownMenu.Trigger>
                      <DropdownMenu.Content>
                        <DropdownMenu.Label>Key</DropdownMenu.Label>
                        <DropdownMenu.Item>
                          <KeyRound size={15} strokeWidth={1.75} />
                          Rotate
                        </DropdownMenu.Item>
                        <DropdownMenu.Separator />
                        <DropdownMenu.Item
                          tone="danger"
                          onSelect={() => setConfirmOpen(true)}
                        >
                          <Trash2 size={15} strokeWidth={1.75} />
                          Revoke
                        </DropdownMenu.Item>
                      </DropdownMenu.Content>
                    </DropdownMenu.Root>
                  </Table.Cell>
                </Table.Row>
                <Table.Row>
                  <Table.Cell>Staging</Table.Cell>
                  <Table.Cell mono>mbx_sk_test_41a…</Table.Cell>
                  <Table.Cell numeric>—</Table.Cell>
                  <Table.Cell>
                    <Badge.Root tone="neg" dot>
                      Revoked
                    </Badge.Root>
                  </Table.Cell>
                  <Table.Cell />
                </Table.Row>
              </Table.Body>
            </Table.Root>
          </Card.Body>
        </Card.Root>
        <Card.Root variant="panel">
          <Card.Header>
            <Card.Title>Usage</Card.Title>
          </Card.Header>
          <Card.Body>
            <KeyValue.Root layout="stacked">
              <KeyValue.Item>
                <KeyValue.Term>Requests</KeyValue.Term>
                <KeyValue.Value mono>48,201</KeyValue.Value>
              </KeyValue.Item>
              <KeyValue.Item>
                <KeyValue.Term>Error rate</KeyValue.Term>
                <KeyValue.Value mono>0.4%</KeyValue.Value>
              </KeyValue.Item>
              <KeyValue.Item>
                <KeyValue.Term>p95</KeyValue.Term>
                <KeyValue.Value mono>182 ms</KeyValue.Value>
              </KeyValue.Item>
            </KeyValue.Root>
          </Card.Body>
          <Card.Footer>
            <Button.Root variant="ghost" size="sm">
              Export CSV
            </Button.Root>
          </Card.Footer>
        </Card.Root>
      </Section>

      <Section title="Copy">
        <CopyField.Root label="client ID" value="mbx_client_4f2a9c81e0d7" />
        <CopyField.Root
          label="secret key"
          value="mbx_sk_live_9f2c4e7a1b3d5f60718293a4b5c6d7e8"
          showText
        />
        <WalletAddress.Root address={ADDRESS} />
        <CodeBlock.Root snippets={snippets} />
        <CodeBlock.Root title="curl" code={CURL} />
      </Section>

      <Section title="Overlays">
        <Row>
          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <Button.Root variant="secondary">Tooltip</Button.Root>
            </Tooltip.Trigger>
            <Tooltip.Content>Rate limit 60 req/min</Tooltip.Content>
          </Tooltip.Root>
          <Dialog.Root>
            <Dialog.Trigger asChild>
              <Button.Root variant="secondary">Dialog</Button.Root>
            </Dialog.Trigger>
            <Dialog.Content>
              <Dialog.Header>
                <Dialog.Title>Add redirect URI</Dialog.Title>
                <Dialog.Description>Test environment</Dialog.Description>
              </Dialog.Header>
              <Dialog.Body>
                <Field.Root>
                  <Field.Label>URI</Field.Label>
                  <Field.Control>
                    <Input.Root mono placeholder="https://" />
                  </Field.Control>
                </Field.Root>
              </Dialog.Body>
              <Dialog.Footer>
                <Dialog.Close asChild>
                  <Button.Root variant="secondary">Cancel</Button.Root>
                </Dialog.Close>
                <Button.Root>Add</Button.Root>
              </Dialog.Footer>
            </Dialog.Content>
          </Dialog.Root>
          <Dialog.Root>
            <Dialog.Trigger asChild>
              <Button.Root variant="secondary">Sheet</Button.Root>
            </Dialog.Trigger>
            <Dialog.Content placement="sheet" size="md">
              <Dialog.Header>
                <Dialog.Title>New secret key</Dialog.Title>
                <Dialog.Description>Shown once</Dialog.Description>
              </Dialog.Header>
              <CopyField.Root
                label="secret key"
                value="mbx_sk_test_41a0c2d9e8f7"
                showText
              />
            </Dialog.Content>
          </Dialog.Root>
          <Button.Root variant="danger" onClick={() => setConfirmOpen(true)}>
            Alert dialog
          </Button.Root>
          <AlertDialog.Root open={confirmOpen} onOpenChange={setConfirmOpen}>
            <AlertDialog.Content>
              <AlertDialog.Header>
                <AlertDialog.Title>Revoke key?</AlertDialog.Title>
                <AlertDialog.Description>
                  Requests using mbx_sk_live_9f2… fail immediately.
                </AlertDialog.Description>
              </AlertDialog.Header>
              <AlertDialog.Footer>
                <AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
                <AlertDialog.Action>Revoke</AlertDialog.Action>
              </AlertDialog.Footer>
            </AlertDialog.Content>
          </AlertDialog.Root>
        </Row>
        <ToastDemo />
      </Section>

      <Section title="Empty and loading">
        <EmptyState.Root>
          <EmptyState.Title>No apps</EmptyState.Title>
          <EmptyState.Action>
            <Button.Root>Create app</Button.Root>
          </EmptyState.Action>
        </EmptyState.Root>
        <EmptyState.Root layout="centered">
          <EmptyState.Title>No requests yet</EmptyState.Title>
          <EmptyState.Action>
            <Button.Root variant="secondary">View quickstart</Button.Root>
          </EmptyState.Action>
        </EmptyState.Root>
        <div aria-busy="true" className="flex flex-col gap-2">
          <Skeleton.Root className="w-1/3" />
          <Skeleton.Root shape="block" />
          <Skeleton.Root shape="circle" />
        </div>
      </Section>

      <Section title="App shell">
        <div className="relative overflow-hidden rounded-[10px] border border-line">
          <AppShell.Root className="min-h-[360px]">
            <AppShell.Sidebar className="h-auto self-stretch">
              <AppShell.SidebarHeader>
                <Logo.Root />
              </AppShell.SidebarHeader>
              <AppShell.SidebarNav aria-label={`${theme} demo`}>
                <AppShell.SidebarSection>
                  <AppShell.SidebarItem
                    href="#overview"
                    label="Overview"
                    active
                    icon={<LayoutGrid size={18} strokeWidth={1.75} />}
                  />
                  <AppShell.SidebarItem
                    href="#apps"
                    label="Apps"
                    icon={<Box size={18} strokeWidth={1.75} />}
                  />
                </AppShell.SidebarSection>
                <AppShell.SidebarSection label="More">
                  <AppShell.SidebarItem
                    href="#settings"
                    label="Settings"
                    icon={<Settings size={18} strokeWidth={1.75} />}
                  />
                </AppShell.SidebarSection>
              </AppShell.SidebarNav>
              <AppShell.SidebarFooter>
                <WalletAddress.Root address={ADDRESS} />
              </AppShell.SidebarFooter>
            </AppShell.Sidebar>
            <AppShell.Body>
              <AppShell.TopBar className="static">
                <Logo.Root variant="icon" className="md:hidden" />
                <span className="flex-1" />
                <Button.Root size="lg">Connect wallet</Button.Root>
              </AppShell.TopBar>
              <AppShell.Main id={id("main")} className="pb-5 md:pb-5">
                <p className="text-[13px] text-secondary">Main</p>
              </AppShell.Main>
            </AppShell.Body>
          </AppShell.Root>
        </div>
      </Section>
    </div>
  )
}

/** Dev-only gallery: every component, light and dark side by side. */
export function Showcase(): ReactElement {
  return (
    <Tooltip.Provider delayDuration={300}>
      <Toast.Provider>
        <div id="showcase" className="grid min-h-dvh xl:grid-cols-2">
          <div className="light min-w-0 p-6 md:p-8">
            <Gallery theme="light" />
          </div>
          <div className="dark min-w-0 p-6 md:p-8">
            <Gallery theme="dark" />
          </div>
        </div>
      </Toast.Provider>
    </Tooltip.Provider>
  )
}

export default Showcase
