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
      "/v1/gauge-profiles",
      "/v1/gauge-profiles/{network}/{gaugeAddress}",
      "/v1/health",
      "/v1/networks",
      "/v1/vebtc/{network}/{tokenId}/gauge-profile",
    ])
    expect(document.paths["/v1/health"].get.security).toEqual([])
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
})
