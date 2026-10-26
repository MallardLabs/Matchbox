import { readFile } from "node:fs/promises"
import { describe, expect, it } from "vitest"
import { formatOpenApiJson, openApiJsonPath } from "../scripts/openapi-file"
import { createOpenApiDocument } from "./openapi"

describe("openapi.json", () => {
  it("is up to date (run `pnpm --filter @repo/platform-contracts generate:openapi`)", async () => {
    const [expected, actual] = await Promise.all([
      formatOpenApiJson(),
      readFile(openApiJsonPath, "utf8"),
    ])
    expect(actual.replaceAll("\r\n", "\n")).toBe(expected)
  })
})

describe("createOpenApiDocument", () => {
  const document = createOpenApiDocument()

  it("declares OpenAPI 3.1 with the public server", () => {
    expect(document.openapi).toBe("3.1.0")
    expect(document.servers).toEqual([{ url: "https://api.matchbox.markets" }])
    expect(document.components.securitySchemes.bearerAuth.scheme).toBe("bearer")
  })

  it("covers exactly the public routes", () => {
    expect(Object.keys(document.paths).sort()).toEqual([
      "/v1/epochs/current",
      "/v1/gauge-profiles",
      "/v1/gauge-profiles/{network}/{gaugeAddress}",
      "/v1/gauges",
      "/v1/gauges/{network}/{gaugeAddress}",
      "/v1/gauges/{network}/{gaugeAddress}/epochs",
      "/v1/health",
      "/v1/incentives",
      "/v1/networks",
      "/v1/vebtc/{network}/{tokenId}/gauge",
      "/v1/vebtc/{network}/{tokenId}/gauge-profile",
    ])
    expect(document.paths["/v1/health"].get.security).toEqual([])
  })

  it("gives every operation a unique id and a declared tag", () => {
    const tags = new Set(document.tags.map((tag) => tag.name))
    const operations = Object.values(document.paths).map((item) => item.get)
    const ids = operations.map((operation) => operation.operationId)
    expect(new Set(ids).size).toBe(ids.length)
    for (const operation of operations) {
      for (const tag of operation.tags) expect(tags).toContain(tag)
    }
    expect(ids).toEqual(
      expect.arrayContaining([
        "getCurrentEpoch",
        "listGauges",
        "getGauge",
        "listGaugeEpochs",
        "getGaugeByVebtc",
        "listIncentives",
      ]),
    )
  })

  it("documents market snapshots and their parameters", () => {
    const incentives = document.paths["/v1/incentives"].get
    expect(incentives.responses["503"]).toEqual({
      $ref: "#/components/responses/MarketUnavailable",
    })
    expect(incentives.responses["404"].description).toContain("not_found")
    expect(incentives.description).toContain("aprPercent")
    expect(incentives.parameters.map((parameter) => parameter.name)).toEqual([
      "network",
      "epoch",
      "voter",
      "gauge",
      "If-None-Match",
    ])
    const epochs = document.paths["/v1/gauges/{network}/{gaugeAddress}/epochs"]
    expect(epochs.get.parameters).toContainEqual(
      expect.objectContaining({
        name: "limit",
        schema: { type: "integer", minimum: 1, maximum: 104, default: 12 },
      }),
    )
    expect(document.paths["/v1/epochs/current"].get.responses["503"]).toEqual({
      $ref: "#/components/responses/ServiceDisabled",
    })
  })

  it("documents rate limiting and errors", () => {
    const list = document.paths["/v1/gauge-profiles"].get
    expect(list.responses["429"]).toEqual({
      $ref: "#/components/responses/RateLimited",
    })
    expect(Object.keys(list.responses["200"].headers)).toEqual(
      expect.arrayContaining([
        "RateLimit-Limit",
        "RateLimit-Remaining",
        "RateLimit-Reset",
        "X-Request-Id",
        "ETag",
      ]),
    )
    expect(
      Object.keys(document.components.responses.RateLimited.headers),
    ).toContain("Retry-After")
  })

  it("references component schemas instead of inlining them", () => {
    const schemas = document.components.schemas
    expect(Object.keys(schemas)).toEqual(
      expect.arrayContaining([
        "GaugeProfile",
        "BoostGaugeProfile",
        "ValidatorGaugeProfile",
        "GaugeProfileList",
        "ErrorBody",
      ]),
    )
    expect(schemas.GaugeProfile).toMatchObject({
      oneOf: [
        { $ref: "#/components/schemas/BoostGaugeProfile" },
        { $ref: "#/components/schemas/ValidatorGaugeProfile" },
      ],
      discriminator: { propertyName: "profileType" },
    })
    expect(JSON.stringify(schemas)).not.toContain("$schema")
    expect(JSON.stringify(schemas)).not.toContain(
      '"additionalProperties":false',
    )
  })

  it("discriminates gauges on voter and documents market fields", () => {
    const schemas = document.components.schemas
    expect(schemas.Gauge).toMatchObject({
      oneOf: [
        { $ref: "#/components/schemas/BoostGauge" },
        { $ref: "#/components/schemas/PoolGauge" },
        { $ref: "#/components/schemas/ValidatorGauge" },
        { $ref: "#/components/schemas/ThirdPartyGauge" },
      ],
      discriminator: {
        propertyName: "voter",
        mapping: {
          boost: "#/components/schemas/BoostGauge",
          pools: "#/components/schemas/PoolGauge",
          validators: "#/components/schemas/ValidatorGauge",
          "third-party": "#/components/schemas/ThirdPartyGauge",
        },
      },
    })
    expect(schemas.GaugeList).toMatchObject({
      properties: {
        data: { items: { $ref: "#/components/schemas/Gauge" } },
        meta: { $ref: "#/components/schemas/MarketMeta" },
      },
    })
    expect(schemas.GaugeIncentives).toMatchObject({
      properties: {
        aprPercent: {
          description: expect.stringContaining(
            "totalUsd * 52 / (weight / 1e18 * votingTokenUsd) * 100",
          ),
        },
      },
    })
    expect(schemas.Reward).toMatchObject({
      properties: { usd: { description: expect.stringContaining("null") } },
    })
  })
})
