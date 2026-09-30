import { networkForEnvironmentKind } from "@repo/platform-contracts/network"
import openapi from "@repo/platform-contracts/openapi.json"
import { createFileRoute } from "@tanstack/react-router"
import type { ReactElement } from "react"
import OpenApiReference from "../../../components/docs/OpenApiReference"
import { useDocsCredentials } from "../../../lib/docs-context"
import { parseOpenApi } from "../../../lib/openapi"
import { useTitle } from "../../../lib/title"

export const Route = createFileRoute("/_app/docs/reference")({
  component: ReferencePage,
})

const document = parseOpenApi(openapi)

function ReferencePage(): ReactElement {
  useTitle("API reference · Docs")
  const { kind } = useDocsCredentials()
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-[24px] font-600 text-ink">API reference</h1>
        <p className="font-mono text-[12px] text-secondary">
          {`${document.info.title} ${document.info.version} · ${document.servers[0]?.url ?? ""}`}
        </p>
      </header>
      <OpenApiReference
        document={document}
        network={networkForEnvironmentKind(kind)}
      />
    </div>
  )
}
