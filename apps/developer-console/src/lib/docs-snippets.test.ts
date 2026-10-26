import openapi from "@repo/platform-contracts/openapi.json"
import { describe, expect, it } from "vitest"
import { endpointSnippets } from "./docs-snippets"
import { groupEndpoints, parseOpenApi } from "./openapi"

const document = parseOpenApi(openapi)
const endpoints = groupEndpoints(document).flatMap((group) => group.endpoints)

function snippetsFor(operationId: string): [string, string] {
  const endpoint = endpoints.find((item) => item.operationId === operationId)
  if (endpoint === undefined) throw new Error(`No operation ${operationId}`)
  const [ts, curl] = endpointSnippets(endpoint, document, "mezo")
  return [ts.code, curl.code]
}

describe("endpointSnippets", () => {
  it("uses an SDK method for every authenticated operation", () => {
    for (const endpoint of endpoints.filter((item) => item.authenticated)) {
      const [ts] = endpointSnippets(endpoint, document, "mezo")
      expect(ts.code, endpoint.operationId).toContain("createMatchboxClient")
    }
  })

  it("calls the market methods with the sample network", () => {
    expect(snippetsFor("listIncentives")[0]).toContain(
      'matchbox.incentives.list({ network: "mezo", epoch: "current" })',
    )
    expect(snippetsFor("listGaugeEpochs")[0]).toMatch(
      /matchbox\.gauges\.epochs\("mezo", "0x[0-9a-f]{40}", \{ limit: 12 \}\)/,
    )
    expect(snippetsFor("getGaugeByVebtc")[0]).toContain(
      'matchbox.gauges.byVebtc("mezo", 1234n)',
    )
    expect(snippetsFor("getCurrentEpoch")[1]).toBe(
      'curl "https://api.matchbox.markets/v1/epochs/current" \\\n  -H "Authorization: Bearer $MATCHBOX_API_KEY"',
    )
    expect(snippetsFor("listGauges")[1]).toContain(
      "https://api.matchbox.markets/v1/gauges?network=mezo",
    )
  })
})
