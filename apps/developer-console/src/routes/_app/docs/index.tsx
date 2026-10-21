import { networkForEnvironmentKind } from "@repo/platform-contracts/network"
import { oidcEndpointPaths } from "@repo/platform-contracts/oidc"
import openapi from "@repo/platform-contracts/openapi.json"
import * as Button from "@repo/ui/button"
import { cn } from "@repo/ui/cn"
import * as CodeBlock from "@repo/ui/code-block"
import * as Select from "@repo/ui/select"
import { Link, createFileRoute } from "@tanstack/react-router"
import { ArrowRight, Braces } from "lucide-react"
import type { ReactElement, ReactNode } from "react"
import DocsHeader from "../../../components/docs/DocsHeader"
import SectionHead from "../../../components/ui/SectionHead"
import { shortKeyPrefix } from "../../../lib/api-keys"
import { useDocsControls, useDocsCredentials } from "../../../lib/docs-context"
import { docPages } from "../../../lib/docs-pages"
import { buildDocsIndex } from "../../../lib/docs-search"
import {
  apiOrigin,
  installSnippets,
  quickstartSnippets,
} from "../../../lib/docs-snippets"
import { groupEndpoints, parseOpenApi } from "../../../lib/openapi"
import { useTitle } from "../../../lib/title"

export const Route = createFileRoute("/_app/docs/")({
  component: QuickstartPage,
})

const document = parseOpenApi(openapi)
const endpoints = groupEndpoints(document).flatMap((group) => group.endpoints)
const guideHints = new Map(
  buildDocsIndex([]).map((entry) => [entry.title, entry.detail]),
)
const quickGuides = docPages.filter(
  (page) => page.slug !== "environments" && page.slug !== "changelog",
)
const idEndpoints = [
  { method: "GET", path: oidcEndpointPaths.authorization },
  { method: "POST", path: oidcEndpointPaths.token },
  { method: "GET", path: oidcEndpointPaths.userinfo },
] as const

function Step({
  index,
  title,
  children,
}: {
  index: number
  title: string
  children: ReactNode
}): ReactElement {
  return (
    <li className="flex gap-4">
      <span
        aria-hidden="true"
        className="flex size-6 shrink-0 items-center justify-center rounded-full bg-ink text-caption font-700 text-surface"
      >
        {index}
      </span>
      <section className="flex min-w-0 flex-1 flex-col gap-2.5">
        <h2 className="text-nav font-600 text-ink">
          <span className="sr-only">{`Step ${index}: `}</span>
          {title}
        </h2>
        {children}
      </section>
    </li>
  )
}

function MethodPill({ method }: { method: string }): ReactElement {
  return (
    <span
      className={cn(
        "inline-flex h-[22px] w-11 shrink-0 items-center justify-center rounded font-mono text-caption",
        method === "GET"
          ? "bg-inset text-ink-2"
          : "bg-accent-soft text-accent-ink",
      )}
    >
      {method}
    </span>
  )
}

function QuickstartPage(): ReactElement {
  useTitle("Quickstart · Docs")
  const credentials = useDocsCredentials()
  const { apps, appId, setApp } = useDocsControls()
  const network = networkForEnvironmentKind(credentials.kind)
  const [ts, curl] = quickstartSnippets(credentials)
  return (
    <div className="flex flex-col gap-6">
      <DocsHeader title="Quickstart">
        <dl className="m-0 grid grid-cols-2 gap-x-6 gap-y-3 border-y border-line py-3 md:grid-cols-[minmax(0,1fr)_120px_180px_150px]">
          <div className="col-span-2 flex min-w-0 flex-col gap-1 md:col-span-1">
            <dt className="text-caption text-muted">Base URL</dt>
            <dd className="m-0 truncate font-mono text-body-sm text-ink">
              {apiOrigin}
            </dd>
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <dt className="text-caption text-muted">Network</dt>
            <dd className="m-0 font-mono text-body-sm text-ink">{network}</dd>
          </div>
          {apps === null || apps.length === 0 ? null : (
            <div className="flex min-w-0 flex-col gap-1">
              <dt className="text-caption text-muted">App</dt>
              <dd className="m-0">
                <Select.Root value={appId ?? ""} onValueChange={setApp}>
                  <Select.Trigger
                    aria-label="App"
                    size="sm"
                    className="h-6 border-0 bg-transparent px-0 text-body-sm"
                  >
                    <Select.Value />
                  </Select.Trigger>
                  <Select.Content>
                    {apps.map((item) => (
                      <Select.Item key={item.id} value={item.id}>
                        {item.name}
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select.Root>
              </dd>
            </div>
          )}
          <div className="flex min-w-0 flex-col gap-1">
            <dt className="text-caption text-muted">Key</dt>
            <dd
              title={credentials.secretKeyPrefix}
              className="m-0 truncate font-mono text-body-sm text-ink"
            >
              {shortKeyPrefix(credentials.secretKeyPrefix)}
            </dd>
          </div>
        </dl>
      </DocsHeader>
      <ol className="m-0 flex list-none flex-col gap-6 p-0">
        <Step index={1} title="Install">
          <CodeBlock.Root snippets={installSnippets()} />
        </Step>
        <Step index={2} title="Read gauge profiles">
          <CodeBlock.Root snippets={[ts, curl]} />
        </Step>
      </ol>
      <div className="grid grid-cols-1 gap-8 pt-2 lg:grid-cols-2">
        <section aria-labelledby="qs-guides" className="flex min-w-0 flex-col">
          <SectionHead id="qs-guides" title="Guides" className="pb-1" />
          <ul className="m-0 flex list-none flex-col p-0">
            {quickGuides.map((page) => (
              <li key={page.slug} className="border-b border-line">
                <Link
                  to="/docs/$page"
                  params={{ page: page.slug }}
                  search={(previous) => previous}
                  className="group flex items-center gap-2.5 py-2.5"
                >
                  <span className="min-w-0 flex-1 truncate text-body-sm font-600 text-ink group-hover:underline">
                    {page.title}
                  </span>
                  <span className="text-caption text-muted">
                    {guideHints.get(page.title) ?? ""}
                  </span>
                  <ArrowRight
                    aria-hidden="true"
                    size={13}
                    strokeWidth={1.75}
                    className="text-muted"
                  />
                </Link>
              </li>
            ))}
          </ul>
        </section>
        <section
          aria-labelledby="qs-reference"
          className="flex min-w-0 flex-col"
        >
          <SectionHead id="qs-reference" title="Reference" className="pb-1">
            <Button.Root variant="ghost" size="sm" asChild>
              <Link to="/docs/reference" search={(previous) => previous}>
                <Braces aria-hidden="true" size={13} strokeWidth={1.75} />
                OpenAPI
              </Link>
            </Button.Root>
          </SectionHead>
          <ul className="m-0 flex list-none flex-col p-0">
            {endpoints.map((endpoint) => (
              <li key={endpoint.id} className="border-b border-line">
                <Link
                  to="/docs/reference"
                  hash={endpoint.id}
                  search={(previous) => previous}
                  className="group flex min-w-0 items-center gap-2.5 py-2"
                >
                  <MethodPill method={endpoint.method.toUpperCase()} />
                  <span className="min-w-0 flex-1 truncate font-mono text-body-sm text-ink group-hover:underline">
                    {endpoint.path}
                  </span>
                </Link>
              </li>
            ))}
            {idEndpoints.map((endpoint) => (
              <li key={endpoint.path} className="border-b border-line">
                <Link
                  to="/docs/$page"
                  params={{ page: "oidc" }}
                  search={(previous) => previous}
                  className="group flex min-w-0 items-center gap-2.5 py-2"
                >
                  <MethodPill method={endpoint.method} />
                  <span className="min-w-0 flex-1 truncate font-mono text-body-sm text-ink group-hover:underline">
                    {endpoint.path}
                  </span>
                  <span className="text-caption text-muted">ID</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}
