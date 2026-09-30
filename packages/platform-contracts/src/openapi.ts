import { z } from "zod"
import { addressSchema, decimalStringSchema, isoDateTimeSchema } from "./common"
import { errorBodySchema, errorCodeSchema } from "./errors"
import {
  boostGaugeProfileSchema,
  gaugeProfileChainStateSchema,
  gaugeProfileDetailSchema,
  gaugeProfileListDefaultLimit,
  gaugeProfileListMaxAddresses,
  gaugeProfileListMaxLimit,
  gaugeProfileListSchema,
  gaugeProfileSchema,
  gaugeProfileTypeSchema,
  healthResponseSchema,
  networkListSchema,
  sourceMetaSchema,
  validatorGaugeProfileSchema,
} from "./gauge-profiles"
import {
  environmentKindSchema,
  networkSchema,
  networkSlugSchema,
} from "./network"

export const publicApiVersion = "2.0.0"
export const publicApiServerUrl = "https://api.matchbox.markets"

type JsonSchema = Record<string, unknown>

const componentSchemas = {
  NetworkSlug: networkSlugSchema,
  EnvironmentKind: environmentKindSchema,
  Network: networkSchema,
  NetworkList: networkListSchema,
  Health: healthResponseSchema,
  Address: addressSchema,
  DecimalString: decimalStringSchema,
  GaugeProfileType: gaugeProfileTypeSchema,
  GaugeProfileChainState: gaugeProfileChainStateSchema,
  BoostGaugeProfile: boostGaugeProfileSchema,
  ValidatorGaugeProfile: validatorGaugeProfileSchema,
  GaugeProfile: gaugeProfileSchema,
  SourceMeta: sourceMetaSchema,
  GaugeProfileList: gaugeProfileListSchema,
  GaugeProfileDetail: gaugeProfileDetailSchema,
  ErrorCode: errorCodeSchema,
  ErrorBody: errorBodySchema,
} as const satisfies Record<string, z.ZodType>

type ComponentName = keyof typeof componentSchemas

function componentRef(name: ComponentName): JsonSchema {
  return { $ref: `#/components/schemas/${name}` }
}

/**
 * Post-processes generated schemas: drops zod's verbose date-time regex
 * (`format: date-time` says enough) and `additionalProperties: false`, so
 * adding response fields later is not a breaking change for strict clients.
 */
function simplifySchema(context: { jsonSchema: JsonSchema }): void {
  if (context.jsonSchema.format === "date-time") {
    Reflect.deleteProperty(context.jsonSchema, "pattern")
  }
  if (context.jsonSchema.additionalProperties === false) {
    Reflect.deleteProperty(context.jsonSchema, "additionalProperties")
  }
}

function buildComponents(): Record<string, JsonSchema> {
  const registry = z.registry<{ id: string }>()
  for (const [id, schema] of Object.entries(componentSchemas)) {
    registry.add(schema, { id })
  }
  const generated = z.toJSONSchema(registry, {
    target: "draft-2020-12",
    uri: (id) => `#/components/schemas/${id}`,
    override: simplifySchema,
  })
  const components: Record<string, JsonSchema> = {}
  for (const [id, schema] of Object.entries(generated.schemas)) {
    const { $schema: _schema, $id: _id, ...rest } = schema
    components[id] = rest
  }
  const gaugeProfile = components.GaugeProfile
  if (gaugeProfile !== undefined) {
    gaugeProfile.discriminator = {
      propertyName: "profileType",
      mapping: {
        "boost-gauge": "#/components/schemas/BoostGaugeProfile",
        "validator-gauge": "#/components/schemas/ValidatorGaugeProfile",
      },
    }
  }
  return components
}

/** JSON Schema for a request parameter (input side of the zod schema). */
function parameterSchema(schema: z.ZodType): JsonSchema {
  const { $schema: _schema, ...rest } = z.toJSONSchema(schema, {
    target: "draft-2020-12",
    io: "input",
    override: simplifySchema,
  })
  return rest
}

const requestIdHeader = {
  description: "Unique id for this request; include it in support requests.",
  schema: { type: "string" },
}

const rateLimitHeaders = {
  "RateLimit-Limit": {
    description: "Requests allowed in the current window.",
    schema: { type: "integer" },
  },
  "RateLimit-Remaining": {
    description: "Requests left in the current window.",
    schema: { type: "integer" },
  },
  "RateLimit-Reset": {
    description: "Seconds until the current window resets.",
    schema: { type: "integer" },
  },
}

function errorResponse(description: string, extraHeaders: JsonSchema = {}) {
  return {
    description,
    headers: { "X-Request-Id": requestIdHeader, ...extraHeaders },
    content: {
      "application/json": { schema: componentRef("ErrorBody") },
    },
  }
}

const authenticatedErrorResponses = {
  "400": { $ref: "#/components/responses/InvalidRequest" },
  "401": { $ref: "#/components/responses/Unauthorized" },
  "403": { $ref: "#/components/responses/Forbidden" },
  "429": { $ref: "#/components/responses/RateLimited" },
  "500": { $ref: "#/components/responses/InternalError" },
  "503": { $ref: "#/components/responses/ServiceDisabled" },
}

function okResponse(description: string, schema: ComponentName) {
  return {
    description,
    headers: {
      "X-Request-Id": requestIdHeader,
      ETag: {
        description: "Weak validator for `If-None-Match`.",
        schema: { type: "string" },
      },
      "Cache-Control": {
        description: "`private, max-age=30`.",
        schema: { type: "string" },
      },
      ...rateLimitHeaders,
    },
    content: { "application/json": { schema: componentRef(schema) } },
  }
}

const notModifiedResponse = {
  description: "Not modified (`If-None-Match` matched the current `ETag`).",
  headers: { "X-Request-Id": requestIdHeader, ...rateLimitHeaders },
}

const ifNoneMatchParameter = {
  name: "If-None-Match",
  in: "header",
  required: false,
  description: "`ETag` from a previous response; returns 304 when unchanged.",
  schema: { type: "string" },
}

const networkPathParameter = {
  name: "network",
  in: "path",
  required: true,
  description:
    "`mezo` for live keys, `mezo-testnet` for test keys. Other values return 403 `network_not_allowed`.",
  schema: componentRef("NetworkSlug"),
}

const securityDescription = [
  "Send `Authorization: Bearer <key>`.",
  "",
  "- **Publishable keys** (`mbx_pk_test_…`, `mbx_pk_live_…`) are safe in browsers. The request `Origin` must be registered on the key's environment.",
  "- **Secret keys** (`mbx_sk_test_…`, `mbx_sk_live_…`) are server-only. Requests carrying an `Origin` header are rejected; an optional CIDR allowlist applies.",
  "",
  "Test keys read `mezo-testnet`; live keys read `mezo` and require an approved environment. Revocation takes effect within 15 seconds.",
].join("\n")

export function createOpenApiDocument() {
  return {
    openapi: "3.1.0",
    jsonSchemaDialect: "https://json-schema.org/draft/2020-12/schema",
    info: {
      title: "Matchbox API",
      version: publicApiVersion,
      description:
        "Read Matchbox gauge profiles for Mezo boost and validator gauges. Generated from `@repo/platform-contracts`.",
      contact: { url: "https://developer.matchbox.markets" },
    },
    servers: [{ url: publicApiServerUrl }],
    security: [{ bearerAuth: [] }],
    tags: [{ name: "Meta" }, { name: "Networks" }, { name: "Gauge profiles" }],
    paths: {
      "/v1/health": {
        get: {
          operationId: "getHealth",
          tags: ["Meta"],
          summary: "Service health",
          security: [],
          responses: {
            "200": {
              description: "Service is up.",
              headers: { "X-Request-Id": requestIdHeader },
              content: {
                "application/json": { schema: componentRef("Health") },
              },
            },
          },
        },
      },
      "/v1/networks": {
        get: {
          operationId: "listNetworks",
          tags: ["Networks"],
          summary: "Networks this key can read",
          responses: {
            "200": okResponse("Readable networks.", "NetworkList"),
            ...authenticatedErrorResponses,
          },
        },
      },
      "/v1/gauge-profiles": {
        get: {
          operationId: "listGaugeProfiles",
          tags: ["Gauge profiles"],
          summary: "List gauge profiles",
          description:
            "Ordered by `updatedAt` descending, then `gaugeAddress`. Follow `nextCursor` until it is null.",
          parameters: [
            {
              name: "network",
              in: "query",
              required: true,
              description: "Must match the key's environment network.",
              schema: componentRef("NetworkSlug"),
            },
            {
              name: "profileType",
              in: "query",
              required: false,
              schema: componentRef("GaugeProfileType"),
            },
            {
              name: "tag",
              in: "query",
              required: false,
              description: "Only profiles with this tag.",
              schema: parameterSchema(z.string().min(1).max(64)),
            },
            {
              name: "updatedSince",
              in: "query",
              required: false,
              description: "Only profiles updated at or after this time.",
              schema: parameterSchema(isoDateTimeSchema),
            },
            {
              name: "address",
              in: "query",
              required: false,
              description: `Gauge addresses to fetch (repeatable, up to ${gaugeProfileListMaxAddresses}).`,
              style: "form",
              explode: true,
              schema: {
                type: "array",
                maxItems: gaugeProfileListMaxAddresses,
                items: parameterSchema(z.string().regex(/^0x[0-9a-fA-F]{40}$/)),
              },
            },
            {
              name: "limit",
              in: "query",
              required: false,
              schema: {
                type: "integer",
                minimum: 1,
                maximum: gaugeProfileListMaxLimit,
                default: gaugeProfileListDefaultLimit,
              },
            },
            {
              name: "cursor",
              in: "query",
              required: false,
              description: "Opaque `nextCursor` from the previous page.",
              schema: parameterSchema(z.string().min(1).max(1024)),
            },
            ifNoneMatchParameter,
          ],
          responses: {
            "200": okResponse("A page of gauge profiles.", "GaugeProfileList"),
            "304": notModifiedResponse,
            ...authenticatedErrorResponses,
          },
        },
      },
      "/v1/gauge-profiles/{network}/{gaugeAddress}": {
        get: {
          operationId: "getGaugeProfile",
          tags: ["Gauge profiles"],
          summary: "Get a gauge profile",
          parameters: [
            networkPathParameter,
            {
              name: "gaugeAddress",
              in: "path",
              required: true,
              description: "Gauge contract address (any case).",
              schema: parameterSchema(z.string().regex(/^0x[0-9a-fA-F]{40}$/)),
            },
            ifNoneMatchParameter,
          ],
          responses: {
            "200": okResponse("The gauge profile.", "GaugeProfileDetail"),
            "304": notModifiedResponse,
            "404": { $ref: "#/components/responses/NotFound" },
            ...authenticatedErrorResponses,
          },
        },
      },
      "/v1/vebtc/{network}/{tokenId}/gauge-profile": {
        get: {
          operationId: "getGaugeProfileByVebtc",
          tags: ["Gauge profiles"],
          summary: "Get the boost gauge profile for a veBTC token",
          parameters: [
            networkPathParameter,
            {
              name: "tokenId",
              in: "path",
              required: true,
              description: "veBTC token id (decimal).",
              schema: componentRef("DecimalString"),
            },
            ifNoneMatchParameter,
          ],
          responses: {
            "200": okResponse("The boost gauge profile.", "GaugeProfileDetail"),
            "304": notModifiedResponse,
            "404": { $ref: "#/components/responses/NotFound" },
            ...authenticatedErrorResponses,
          },
        },
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "mbx_{pk|sk}_{test|live}_<id>_<secret>",
          description: securityDescription,
        },
      },
      responses: {
        InvalidRequest: errorResponse(
          "`invalid_request`: malformed parameters.",
        ),
        Unauthorized: errorResponse(
          "`unauthorized`: missing, malformed, expired or revoked key.",
        ),
        Forbidden: errorResponse(
          "`forbidden`, `origin_not_allowed` or `network_not_allowed`.",
        ),
        NotFound: errorResponse("`not_found`."),
        RateLimited: errorResponse("`rate_limited`.", {
          ...rateLimitHeaders,
          "Retry-After": {
            description: "Seconds to wait before retrying.",
            schema: { type: "integer" },
          },
        }),
        InternalError: errorResponse("`internal_error`."),
        ServiceDisabled: errorResponse(
          "`service_disabled`: the API is temporarily off.",
        ),
      },
      schemas: buildComponents(),
    },
  }
}

export type OpenApiDocument = ReturnType<typeof createOpenApiDocument>

/** Stable serialization written to `openapi.json` (before formatting). */
export function serializeOpenApiDocument(): string {
  return `${JSON.stringify(createOpenApiDocument(), null, 2)}\n`
}
