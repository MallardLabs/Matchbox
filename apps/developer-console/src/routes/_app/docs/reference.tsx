import openapi from "@repo/platform-contracts/openapi.json"
import { createFileRoute } from "@tanstack/react-router"
import type { ReactElement } from "react"
import DocsHeader from "../../../components/docs/DocsHeader"
import OpenApiReference from "../../../components/docs/OpenApiReference"
import { sampleNetwork } from "../../../lib/docs-snippets"
import { parseOpenApi } from "../../../lib/openapi"
import { useTitle } from "../../../lib/title"

export const Route = createFileRoute("/_app/docs/reference")({
  component: ReferencePage,
})

const document = parseOpenApi(openapi)

function ReferencePage(): ReactElement {
  useTitle("API reference · Docs")
  return (
    <div className="flex flex-col gap-6">
      <DocsHeader title="API reference">
        <p className="border-y border-line py-3 font-mono text-label text-secondary">
          {`${document.info.title} ${document.info.version} · ${document.servers[0]?.url ?? ""}`}
        </p>
      </DocsHeader>
      <OpenApiReference document={document} network={sampleNetwork} />
    </div>
  )
}
