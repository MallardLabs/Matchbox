import {
  networkForEnvironmentKind,
  networkNames,
} from "@repo/platform-contracts/network"
import * as CodeBlock from "@repo/ui/code-block"
import * as CopyField from "@repo/ui/copy-field"
import * as KeyValue from "@repo/ui/key-value"
import { Link, createFileRoute } from "@tanstack/react-router"
import type { ReactElement } from "react"
import { EnvBadge } from "../../../components/Badges"
import { useDocsCredentials } from "../../../lib/docs-context"
import {
  apiOrigin,
  installSnippets,
  quickstartSnippets,
} from "../../../lib/docs-snippets"
import { useTitle } from "../../../lib/title"

export const Route = createFileRoute("/_app/docs/")({
  component: QuickstartPage,
})

function QuickstartPage(): ReactElement {
  useTitle("Quickstart · Docs")
  const credentials = useDocsCredentials()
  const network = networkForEnvironmentKind(credentials.kind)
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-[24px] font-600 text-ink">Quickstart</h1>
      <KeyValue.Root>
        <KeyValue.Item>
          <KeyValue.Term>Environment</KeyValue.Term>
          <KeyValue.Value>
            <EnvBadge kind={credentials.kind} />
          </KeyValue.Value>
        </KeyValue.Item>
        <KeyValue.Item>
          <KeyValue.Term>Network</KeyValue.Term>
          <KeyValue.Value>
            {networkNames[network]}{" "}
            <span className="font-mono text-secondary">{network}</span>
          </KeyValue.Value>
        </KeyValue.Item>
        <KeyValue.Item>
          <KeyValue.Term>Base URL</KeyValue.Term>
          <KeyValue.Value mono>{apiOrigin}</KeyValue.Value>
        </KeyValue.Item>
        <KeyValue.Item>
          <KeyValue.Term>Secret key</KeyValue.Term>
          <KeyValue.Value mono className="text-[12px]">
            {`${credentials.secretKeyPrefix}_…`}
          </KeyValue.Value>
        </KeyValue.Item>
      </KeyValue.Root>
      <section aria-labelledby="qs-install" className="flex flex-col gap-3">
        <h2 id="qs-install" className="text-[16px] font-600 text-ink">
          1 · Install
        </h2>
        <CodeBlock.Root snippets={installSnippets()} />
      </section>
      <section aria-labelledby="qs-key" className="flex flex-col gap-3">
        <h2 id="qs-key" className="text-[16px] font-600 text-ink">
          2 · Key
        </h2>
        <p className="text-[14px] text-ink-2">
          Create a secret key under{" "}
          <Link to="/apps" className="font-600 text-accent-ink">
            Apps › API keys
          </Link>{" "}
          and store it as{" "}
          <code className="font-mono text-[12px]">MATCHBOX_API_KEY</code>.
        </p>
      </section>
      <section aria-labelledby="qs-request" className="flex flex-col gap-3">
        <h2 id="qs-request" className="text-[16px] font-600 text-ink">
          3 · First request
        </h2>
        <CodeBlock.Root snippets={quickstartSnippets(credentials)} />
      </section>
      <section aria-labelledby="qs-oidc" className="flex flex-col gap-3">
        <h2 id="qs-oidc" className="text-[16px] font-600 text-ink">
          Sign in with Matchbox
        </h2>
        <CopyField.Root value={credentials.clientId} label="client ID" />
        <Link
          to="/docs/$page"
          params={{ page: "oidc" }}
          className="self-start text-[13px] font-600 text-accent-ink"
        >
          OIDC guide
        </Link>
      </section>
    </div>
  )
}
