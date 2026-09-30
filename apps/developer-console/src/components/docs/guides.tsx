import {
  defaultErrorMessages,
  errorCodeSchema,
  errorStatusByCode,
} from "@repo/platform-contracts/errors"
import {
  chainIdByNetwork,
  environmentKindSchema,
  networkByEnvironmentKind,
  networkNames,
} from "@repo/platform-contracts/network"
import { oidcEndpointPaths, oidcLifetimes } from "@repo/platform-contracts/oidc"
import {
  endpointClassSchema,
  publishableIpRateLimitPolicy,
  rateLimitHeaderNames,
  rateLimitPolicies,
} from "@repo/platform-contracts/rate-limits"
import {
  claimLabels,
  platformScopeSchema,
  scopeDefinitions,
} from "@repo/platform-contracts/scopes"
import * as Badge from "@repo/ui/badge"
import * as CodeBlock from "@repo/ui/code-block"
import * as CopyField from "@repo/ui/copy-field"
import * as Table from "@repo/ui/table"
import type { ReactElement, ReactNode } from "react"
import { changelog } from "../../lib/changelog"
import { useDocsCredentials } from "../../lib/docs-context"
import type { DocPageSlug } from "../../lib/docs-pages"
import { apiOrigin, idIssuer } from "../../lib/docs-snippets"
import { formatDate, formatInteger } from "../../lib/format"

function H2({
  id,
  children,
}: { id?: string; children: ReactNode }): ReactElement {
  return (
    <h2 id={id} className="scroll-mt-24 pt-4 text-[16px] font-600 text-ink">
      {children}
    </h2>
  )
}

function P({ children }: { children: ReactNode }): ReactElement {
  return (
    <p className="max-w-2xl text-[14px] leading-6 text-ink-2">{children}</p>
  )
}

function C({ children }: { children: ReactNode }): ReactElement {
  return (
    <code className="rounded bg-inset px-1 py-0.5 font-mono text-[12px] text-ink">
      {children}
    </code>
  )
}

function Guide({
  title,
  children,
}: { title: string; children: ReactNode }): ReactElement {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-[24px] font-600 text-ink">{title}</h1>
      {children}
    </div>
  )
}

function AuthGuide(): ReactElement {
  const credentials = useDocsCredentials()
  return (
    <Guide title="Authentication & keys">
      <P>
        Every <C>/v1</C> request sends an API key as a bearer token. Keys belong
        to one environment and read only that environment&apos;s network.
      </P>
      <CodeBlock.Root
        title="Header"
        code={`Authorization: Bearer ${credentials.secretKeyPrefix}_…`}
      />
      <Table.Root density="compact">
        <Table.Header>
          <Table.Row>
            <Table.Head>Type</Table.Head>
            <Table.Head>Prefix</Table.Head>
            <Table.Head>Use</Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          <Table.Row>
            <Table.Cell>Secret</Table.Cell>
            <Table.Cell mono>{credentials.secretKeyPrefix}</Table.Cell>
            <Table.Cell>
              Servers only. Rejected when an Origin header is present. Optional
              CIDR allowlist.
            </Table.Cell>
          </Table.Row>
          <Table.Row>
            <Table.Cell>Publishable</Table.Cell>
            <Table.Cell mono>{credentials.publishableKeyPrefix}</Table.Cell>
            <Table.Cell>
              Browsers. Origin must match a registered origin.
            </Table.Cell>
          </Table.Row>
        </Table.Body>
      </Table.Root>
      <H2>Rotation</H2>
      <P>
        Rotating issues a new key and keeps the old one working for the overlap
        you choose (up to 7 days). Revocation takes effect within 15 seconds.
      </P>
      <H2>Scope</H2>
      <P>
        API keys carry <C>gauge-profiles:read</C>. Live keys work once the live
        environment is approved and the app is active.
      </P>
    </Guide>
  )
}

function OidcGuide(): ReactElement {
  const credentials = useDocsCredentials()
  const discovery = `${idIssuer}${oidcEndpointPaths.discovery}`
  return (
    <Guide title="Sign in with Matchbox">
      <P>
        Matchbox ID is an OpenID Connect provider. Users sign in with their
        wallet (SIWE); your app receives a pairwise <C>sub</C> and the claims
        its approved scopes allow. Authorization code flow with PKCE (S256) is
        required for every client.
      </P>
      <H2>Discovery</H2>
      <CopyField.Root value={discovery} label="discovery URL" />
      <H2>Flow</H2>
      <ol className="m-0 flex max-w-2xl list-decimal flex-col gap-1.5 pl-5 text-[14px] leading-6 text-ink-2">
        <li>
          Create a PKCE pair, <C>state</C> and <C>nonce</C>; store them in the
          session.
        </li>
        <li>
          Redirect to <C>{oidcEndpointPaths.authorization}</C> with a registered
          redirect URI.
        </li>
        <li>
          Verify <C>state</C> on the callback, then exchange <C>code</C> at{" "}
          <C>{oidcEndpointPaths.token}</C>.
        </li>
        <li>
          Verify the ID token (ES256, JWKS at <C>{oidcEndpointPaths.jwks}</C>)
          including <C>nonce</C>.
        </li>
        <li>
          Refresh tokens rotate on every use; store the new one each time.
        </li>
      </ol>
      <CodeBlock.Root
        snippets={[
          {
            language: "ts",
            label: "TypeScript",
            code: [
              "import {",
              "  buildAuthorizeUrl,",
              "  createNonce,",
              "  createPkcePair,",
              "  createState,",
              "  exchangeCode,",
              "  verifyIdToken,",
              '} from "@matchbox-markets/sdk/oidc"',
              "",
              `const clientId = "${credentials.clientId}"`,
              'const redirectUri = "https://app.example.com/callback"',
              "",
              "const pkce = await createPkcePair()",
              "const state = createState()",
              "const nonce = createNonce()",
              "const url = buildAuthorizeUrl({",
              "  clientId,",
              "  redirectUri,",
              '  scopes: ["openid", "wallet"],',
              "  state,",
              "  nonce,",
              "  codeChallenge: pkce.codeChallenge,",
              "})",
              "",
              "// Callback: ?code=…&state=…",
              "const tokens = await exchangeCode({",
              "  clientId,",
              "  clientSecret: process.env.MATCHBOX_CLIENT_SECRET, // confidential only",
              "  code,",
              "  redirectUri,",
              "  codeVerifier: pkce.codeVerifier,",
              "})",
              "const claims = await verifyIdToken(tokens.idToken, { clientId, nonce })",
            ].join("\n"),
          },
          {
            language: "curl",
            label: "curl",
            code: [
              `curl -X POST ${idIssuer}${oidcEndpointPaths.token} \\`,
              `  -u "${credentials.clientId}:$MATCHBOX_CLIENT_SECRET" \\`,
              "  -d grant_type=authorization_code \\",
              "  -d code=$CODE \\",
              "  -d redirect_uri=https://app.example.com/callback \\",
              "  -d code_verifier=$CODE_VERIFIER",
            ].join("\n"),
          },
        ]}
      />
      <H2>Scopes</H2>
      <Table.Root density="compact">
        <Table.Header>
          <Table.Row>
            <Table.Head>Scope</Table.Head>
            <Table.Head>Consent</Table.Head>
            <Table.Head>Claims</Table.Head>
            <Table.Head>Review</Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {platformScopeSchema.options
            .filter((scope) => scopeDefinitions[scope].kind === "oidc")
            .map((scope) => {
              const definition = scopeDefinitions[scope]
              return (
                <Table.Row key={scope}>
                  <Table.Cell mono>{scope}</Table.Cell>
                  <Table.Cell>{definition.consentDescription}</Table.Cell>
                  <Table.Cell mono className="text-[11px]">
                    {definition.claims.join(" ")}
                  </Table.Cell>
                  <Table.Cell>
                    {definition.requiresReview ? (
                      <Badge.Root tone="warn">Required</Badge.Root>
                    ) : (
                      "—"
                    )}
                  </Table.Cell>
                </Table.Row>
              )
            })}
        </Table.Body>
      </Table.Root>
      <H2>Claims</H2>
      <Table.Root density="compact">
        <Table.Header>
          <Table.Row>
            <Table.Head>Claim</Table.Head>
            <Table.Head>Label</Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {Object.entries(claimLabels).map(([claim, label]) => (
            <Table.Row key={claim}>
              <Table.Cell mono>{claim}</Table.Cell>
              <Table.Cell>{label}</Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>
      <H2>Lifetimes</H2>
      <Table.Root density="compact">
        <Table.Body>
          {Object.entries(oidcLifetimes).map(([name, seconds]) => (
            <Table.Row key={name}>
              <Table.Cell>
                {name.replaceAll(/([A-Z])/g, " $1").toLowerCase()}
              </Table.Cell>
              <Table.Cell numeric>{formatInteger(seconds)} s</Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>
    </Guide>
  )
}

function RateLimitsGuide(): ReactElement {
  return (
    <Guide title="Rate limits">
      <P>
        Limits apply per environment with a per-minute burst and a daily quota.
        Every response carries <C>{rateLimitHeaderNames.limit}</C>,{" "}
        <C>{rateLimitHeaderNames.remaining}</C> and{" "}
        <C>{rateLimitHeaderNames.reset}</C>; a <C>429</C> adds{" "}
        <C>{rateLimitHeaderNames.retryAfter}</C> in seconds.
      </P>
      <Table.Root density="compact">
        <Table.Header>
          <Table.Row>
            <Table.Head>Endpoint class</Table.Head>
            <Table.Head numeric>Test / min</Table.Head>
            <Table.Head numeric>Test / day</Table.Head>
            <Table.Head numeric>Live / min</Table.Head>
            <Table.Head numeric>Live / day</Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {endpointClassSchema.options.map((endpointClass) => (
            <Table.Row key={endpointClass}>
              <Table.Cell mono>{endpointClass}</Table.Cell>
              <Table.Cell numeric>
                {formatInteger(rateLimitPolicies.test[endpointClass].perMinute)}
              </Table.Cell>
              <Table.Cell numeric>
                {formatInteger(rateLimitPolicies.test[endpointClass].perDay)}
              </Table.Cell>
              <Table.Cell numeric>
                {formatInteger(rateLimitPolicies.live[endpointClass].perMinute)}
              </Table.Cell>
              <Table.Cell numeric>
                {formatInteger(rateLimitPolicies.live[endpointClass].perDay)}
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>
      <P>
        Publishable keys also have a per-key, per-client-IP limit of{" "}
        {formatInteger(publishableIpRateLimitPolicy.perMinute)}/min and{" "}
        {formatInteger(publishableIpRateLimitPolicy.perDay)}/day. Restricted
        apps fall back to test limits. The SDK retries <C>429</C> and <C>503</C>{" "}
        using <C>Retry-After</C> (max 2).
      </P>
    </Guide>
  )
}

function ErrorsGuide(): ReactElement {
  return (
    <Guide title="Errors">
      <P>
        Errors return JSON with a stable <C>code</C> and the request id.
        Validation failures add <C>issues</C>.
      </P>
      <CodeBlock.Root
        title="ErrorBody"
        code={JSON.stringify(
          {
            error: {
              code: "invalid_request",
              message: "The request is invalid.",
              requestId: "req_01J…",
              docsUrl:
                "https://developer.matchbox.markets/docs/errors#invalid_request",
              issues: [{ path: "network", message: "Invalid option" }],
            },
          },
          null,
          2,
        )}
      />
      <Table.Root density="compact">
        <Table.Header>
          <Table.Row>
            <Table.Head>Code</Table.Head>
            <Table.Head numeric>Status</Table.Head>
            <Table.Head>Meaning</Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {errorCodeSchema.options.map((code) => (
            <Table.Row
              key={code}
              id={code}
              className="scroll-mt-24 target:bg-accent-soft"
            >
              <Table.Cell mono>{code}</Table.Cell>
              <Table.Cell numeric>{errorStatusByCode[code]}</Table.Cell>
              <Table.Cell>{defaultErrorMessages[code]}</Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>
      <P>
        Include <C>X-Request-Id</C> when contacting support; look it up under
        Usage › Request lookup.
      </P>
    </Guide>
  )
}

function PaginationGuide(): ReactElement {
  return (
    <Guide title="Pagination">
      <P>
        List endpoints return <C>{"{ data, nextCursor }"}</C>, ordered by{" "}
        <C>updatedAt</C> descending then address. Pass <C>nextCursor</C> back as{" "}
        <C>cursor</C> until it is <C>null</C>. Cursors are opaque; <C>limit</C>{" "}
        is 1–100 (default 50).
      </P>
      <CodeBlock.Root
        snippets={[
          {
            language: "ts",
            label: "TypeScript",
            code: [
              "for await (const profile of matchbox.gaugeProfiles.iterate({",
              '  network: "mezo",',
              "})) {",
              "  console.log(profile.gaugeAddress)",
              "}",
            ].join("\n"),
          },
          {
            language: "curl",
            label: "curl",
            code: [
              `curl "${apiOrigin}/v1/gauge-profiles?network=mezo&limit=100&cursor=$CURSOR" \\`,
              '  -H "Authorization: Bearer $MATCHBOX_API_KEY"',
            ].join("\n"),
          },
        ]}
      />
      <P>
        Responses carry a weak <C>ETag</C>; send it as <C>If-None-Match</C> to
        get <C>304</C> when nothing changed. Use <C>updatedSince</C> for
        incremental sync.
      </P>
    </Guide>
  )
}

function EnvironmentsGuide(): ReactElement {
  return (
    <Guide title="Environments">
      <P>
        Each app has a test and a live environment with separate client ids,
        keys, secrets, redirect URIs and origins.
      </P>
      <Table.Root density="compact">
        <Table.Header>
          <Table.Row>
            <Table.Head>Environment</Table.Head>
            <Table.Head>Network</Table.Head>
            <Table.Head numeric>Chain ID</Table.Head>
            <Table.Head>Redirects</Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {environmentKindSchema.options.map((kind) => {
            const network = networkByEnvironmentKind[kind]
            return (
              <Table.Row key={kind}>
                <Table.Cell mono>{kind}</Table.Cell>
                <Table.Cell>
                  {networkNames[network]}{" "}
                  <span className="font-mono text-secondary">({network})</span>
                </Table.Cell>
                <Table.Cell numeric>{chainIdByNetwork[network]}</Table.Cell>
                <Table.Cell>
                  {kind === "test" ? "https, http://localhost" : "https only"}
                </Table.Cell>
              </Table.Row>
            )
          })}
        </Table.Body>
      </Table.Root>
      <P>
        A key for one environment gets <C>403 network_not_allowed</C> on the
        other network. Live access requires review: gauge-profile-only apps are
        approved automatically; Discord scopes are reviewed manually.
      </P>
    </Guide>
  )
}

function ChangelogGuide(): ReactElement {
  return (
    <Guide title="Changelog">
      <ol className="m-0 flex list-none flex-col gap-6 p-0">
        {changelog.map((entry) => (
          <li
            key={entry.version}
            className="flex flex-col gap-2 border-t border-line pt-4"
          >
            <p className="flex flex-wrap items-baseline gap-3">
              <span className="text-[15px] font-600 text-ink">
                {entry.title}
              </span>
              <Badge.Root mono>{entry.version}</Badge.Root>
              <time
                dateTime={entry.date}
                className="text-[12px] text-secondary"
              >
                {formatDate(entry.date)}
              </time>
            </p>
            <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-[13px] text-ink-2">
              {entry.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </Guide>
  )
}

export const guides: Record<DocPageSlug, () => ReactElement> = {
  auth: AuthGuide,
  oidc: OidcGuide,
  "rate-limits": RateLimitsGuide,
  errors: ErrorsGuide,
  pagination: PaginationGuide,
  environments: EnvironmentsGuide,
  changelog: ChangelogGuide,
}
