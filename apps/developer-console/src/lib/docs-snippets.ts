import {
  type EnvironmentKind,
  networkForEnvironmentKind,
} from "@repo/platform-contracts/network"
import {
  type Endpoint,
  type OpenApiDocument,
  exampleUrl,
  parameterExample,
} from "./openapi"

export type Snippet = { language: string; label: string; code: string }

export type DocsCredentials = {
  kind: EnvironmentKind
  /** e.g. `mbx_test_…`; a placeholder when signed out. */
  clientId: string
  /** Display prefix of a secret key, e.g. `mbx_sk_test_AbCdEfGhIjKl`. */
  secretKeyPrefix: string
  publishableKeyPrefix: string
}

export function placeholderCredentials(kind: EnvironmentKind): DocsCredentials {
  return {
    kind,
    clientId: `mbx_${kind}_…`,
    secretKeyPrefix: `mbx_sk_${kind}`,
    publishableKeyPrefix: `mbx_pk_${kind}`,
  }
}

export const apiOrigin = "https://api.matchbox.markets"
export const idIssuer = "https://id.matchbox.markets"

export function quickstartSnippets(
  credentials: DocsCredentials,
): [Snippet, Snippet] {
  const network = networkForEnvironmentKind(credentials.kind)
  return [
    {
      language: "ts",
      label: "TypeScript",
      code: [
        'import { createMatchboxClient } from "@matchbox-markets/sdk"',
        "",
        "const matchbox = createMatchboxClient({",
        `  apiKey: process.env.MATCHBOX_API_KEY, // ${credentials.secretKeyPrefix}_…`,
        "})",
        "",
        "const page = await matchbox.gaugeProfiles.list({",
        `  network: "${network}",`,
        "  limit: 20,",
        "})",
        "",
        "for (const profile of page.data) {",
        "  console.log(profile.gaugeAddress, profile.displayName)",
        "}",
      ].join("\n"),
    },
    {
      language: "curl",
      label: "curl",
      code: [
        `curl "${apiOrigin}/v1/gauge-profiles?network=${network}&limit=20" \\`,
        '  -H "Authorization: Bearer $MATCHBOX_API_KEY"',
      ].join("\n"),
    },
  ]
}

export function installSnippets(): [Snippet, Snippet] {
  return [
    { language: "pnpm", label: "pnpm", code: "pnpm add @matchbox-markets/sdk" },
    {
      language: "npm",
      label: "npm",
      code: "npm install @matchbox-markets/sdk",
    },
  ]
}

function sdkCall(
  endpoint: Endpoint,
  document: OpenApiDocument,
  network: string,
): string | null {
  const parameter = (name: string): string => {
    const found = endpoint.parameters.find((item) => item.name === name)
    return found === undefined ? "" : parameterExample(found, document, network)
  }
  switch (endpoint.operationId) {
    case "listNetworks":
      return "await matchbox.networks.list()"
    case "listGaugeProfiles":
      return `await matchbox.gaugeProfiles.list({ network: "${network}", limit: 20 })`
    case "getGaugeProfile":
      return `await matchbox.gaugeProfiles.get("${network}", "${parameter("gaugeAddress")}")`
    case "getGaugeProfileByVebtc":
      return `await matchbox.gaugeProfiles.byVebtc("${network}", ${parameter("tokenId")}n)`
    default:
      return null
  }
}

/** TypeScript (SDK when a method exists, else fetch) and curl for an endpoint. */
export function endpointSnippets(
  endpoint: Endpoint,
  document: OpenApiDocument,
  network: string,
): [Snippet, Snippet] {
  const url = exampleUrl(endpoint, document, network)
  const call = sdkCall(endpoint, document, network)
  const ts =
    call === null
      ? [
          `const response = await fetch("${url}")`,
          "const body = await response.json()",
        ].join("\n")
      : [
          'import { createMatchboxClient } from "@matchbox-markets/sdk"',
          "",
          "const matchbox = createMatchboxClient({ apiKey: process.env.MATCHBOX_API_KEY })",
          `const result = ${call}`,
        ].join("\n")
  const curl = endpoint.authenticated
    ? `curl "${url}" \\\n  -H "Authorization: Bearer $MATCHBOX_API_KEY"`
    : `curl "${url}"`
  return [
    { language: "ts", label: "TypeScript", code: ts },
    { language: "curl", label: "curl", code: curl },
  ]
}
