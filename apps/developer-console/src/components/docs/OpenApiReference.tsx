import * as Badge from "@repo/ui/badge"
import * as CodeBlock from "@repo/ui/code-block"
import * as Table from "@repo/ui/table"
import type { ReactElement } from "react"
import { endpointSnippets } from "../../lib/docs-snippets"
import {
  type Endpoint,
  type OpenApiDocument,
  exampleValue,
  groupEndpoints,
  typeLabel,
} from "../../lib/openapi"
import SchemaTree from "./SchemaTree"

type OpenApiReferenceProps = {
  document: OpenApiDocument
  network: string
}

function statusTone(status: string): "pos" | "warn" | "neg" | "neutral" {
  if (status.startsWith("2")) return "pos"
  if (status.startsWith("3")) return "neutral"
  if (status.startsWith("4")) return "warn"
  return "neg"
}

function EndpointSection({
  endpoint,
  document,
  network,
}: {
  endpoint: Endpoint
  document: OpenApiDocument
  network: string
}): ReactElement {
  const headingId = `${endpoint.id}-title`
  const success = endpoint.responses.find((item) => item.status.startsWith("2"))
  const successSchema = success?.response.content?.["application/json"]?.schema
  const errors = endpoint.responses.filter((item) => Number(item.status) >= 400)
  const snippets = endpointSnippets(endpoint, document, network)

  return (
    <section
      id={endpoint.id}
      aria-labelledby={headingId}
      className="flex scroll-mt-24 flex-col gap-5 border-t border-line pt-8"
    >
      <header className="flex flex-col gap-2">
        <p className="flex flex-wrap items-center gap-2">
          <Badge.Root tone="accent" mono className="uppercase">
            {endpoint.method}
          </Badge.Root>
          <code className="break-all font-mono text-[13px] text-ink">
            {endpoint.path}
          </code>
          {endpoint.authenticated ? null : <Badge.Root>No auth</Badge.Root>}
        </p>
        <h3 id={headingId} className="text-[18px] font-600 text-ink">
          {endpoint.summary}
        </h3>
        {endpoint.description === null ? null : (
          <p className="max-w-2xl text-[13px] text-secondary">
            {endpoint.description}
          </p>
        )}
      </header>

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,440px)]">
        <div className="flex min-w-0 flex-col gap-6">
          {endpoint.parameters.length === 0 ? null : (
            <Table.Root density="compact">
              <Table.Caption className="text-[13px]">Parameters</Table.Caption>
              <Table.Header>
                <Table.Row>
                  <Table.Head>Name</Table.Head>
                  <Table.Head>In</Table.Head>
                  <Table.Head>Type</Table.Head>
                  <Table.Head className="hidden md:table-cell">
                    Notes
                  </Table.Head>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {endpoint.parameters.map((parameter) => (
                  <Table.Row key={`${parameter.in}-${parameter.name}`}>
                    <Table.Cell mono>
                      {parameter.name}
                      {parameter.required === true ? (
                        <span className="ml-1 text-neg" aria-label="required">
                          *
                        </span>
                      ) : null}
                    </Table.Cell>
                    <Table.Cell className="text-secondary">
                      {parameter.in}
                    </Table.Cell>
                    <Table.Cell mono className="text-[11px] text-secondary">
                      {typeLabel(parameter.schema ?? {}, document)}
                    </Table.Cell>
                    <Table.Cell className="hidden text-secondary md:table-cell">
                      {parameter.description ?? ""}
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Root>
          )}

          {successSchema === undefined || success === undefined ? null : (
            <div className="flex flex-col gap-2">
              <h4 className="flex items-center gap-2 text-[13px] font-600 text-ink">
                Response
                <Badge.Root tone="pos" mono>
                  {success.status}
                </Badge.Root>
                <span className="font-mono text-[11px] font-400 text-secondary">
                  {typeLabel(successSchema, document)}
                </span>
              </h4>
              <SchemaTree schema={successSchema} document={document} />
            </div>
          )}

          <div className="flex flex-col gap-2">
            <h4 className="text-[13px] font-600 text-ink">Status codes</h4>
            <ul className="m-0 flex list-none flex-col p-0">
              {endpoint.responses.map((item) => (
                <li
                  key={item.status}
                  className="flex items-baseline gap-3 border-t border-line py-2 text-[12px] first:border-t-0"
                >
                  <Badge.Root tone={statusTone(item.status)} mono>
                    {item.status}
                  </Badge.Root>
                  <span className="text-secondary">
                    {item.response.description}
                  </span>
                </li>
              ))}
            </ul>
            {errors.length === 0 ? null : (
              <p className="text-[12px] text-secondary">
                Errors use <code className="font-mono text-ink">ErrorBody</code>
                .
              </p>
            )}
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <CodeBlock.Root
            snippets={snippets}
            aria-label={`${endpoint.summary} request`}
          />
          {successSchema === undefined ? null : (
            <CodeBlock.Root
              title={`${success?.status ?? "200"} response`}
              code={JSON.stringify(
                exampleValue(successSchema, document),
                null,
                2,
              )}
              className="[&_pre]:max-h-[420px]"
            />
          )}
        </div>
      </div>
    </section>
  )
}

/** Compact reference rendered from the public OpenAPI document. */
export default function OpenApiReference({
  document,
  network,
}: OpenApiReferenceProps): ReactElement {
  const groups = groupEndpoints(document)
  return (
    <div className="flex flex-col gap-10">
      <nav aria-label="Endpoints">
        <ol className="m-0 grid grid-cols-1 list-none gap-6 p-0 sm:grid-cols-3">
          {groups.map((group) => (
            <li key={group.tag} className="flex flex-col gap-2">
              <p className="text-[11px] font-650 uppercase tracking-[0.04em] text-secondary">
                {group.tag}
              </p>
              <ul className="m-0 flex list-none flex-col gap-1 p-0">
                {group.endpoints.map((endpoint) => (
                  <li key={endpoint.id}>
                    <a
                      href={`#${endpoint.id}`}
                      className="flex items-baseline gap-2 text-[12px] text-ink hover:text-accent-ink"
                    >
                      <span className="w-9 shrink-0 font-mono text-[10px] uppercase text-secondary">
                        {endpoint.method}
                      </span>
                      <span className="break-all font-mono">
                        {endpoint.path}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </nav>
      {groups.map((group) => (
        <section
          key={group.tag}
          aria-label={group.tag}
          className="flex flex-col gap-8"
        >
          <h2 className="text-[20px] font-600 text-ink">{group.tag}</h2>
          {group.endpoints.map((endpoint) => (
            <EndpointSection
              key={endpoint.id}
              endpoint={endpoint}
              document={document}
              network={network}
            />
          ))}
        </section>
      ))}
    </div>
  )
}
