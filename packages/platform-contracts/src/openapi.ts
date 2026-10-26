import { z } from "zod"
import {
  addressInputSchema,
  addressSchema,
  decimalStringSchema,
  isoDateTimeSchema,
} from "./common"
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
  gaugeProfileTagFilterSchema,
  gaugeProfileTypeSchema,
  healthResponseSchema,
  networkListSchema,
  sourceMetaSchema,
  validatorGaugeProfileSchema,
} from "./gauge-profiles"
import {
  boostGaugeSchema,
  currentEpochResponseSchema,
  epochSchema,
  epochSeconds,
  epochStatusSchema,
  fixedDecimalSchema,
  gaugeDetailSchema,
  gaugeEpochListSchema,
  gaugeEpochSchema,
  gaugeEpochsDefaultLimit,
  gaugeEpochsMaxLimit,
  gaugeIncentivesSchema,
  gaugeListQuerySchema,
  gaugeListSchema,
  gaugeSchema,
  incentiveListSchema,
  marketMaxGaugeFilters,
  marketMetaSchema,
  poolGaugeSchema,
  priceSourceSchema,
  referencePriceSchema,
  rewardKindSchema,
  rewardSchema,
  thirdPartyGaugeSchema,
  validatorGaugeSchema,
  voterKindSchema,
  voterTotalWeightsSchema,
} from "./market"
import {
  environmentKindSchema,
  networkSchema,
  networkSlugSchema,
} from "./network"

export const publicApiVersion = "2.1.0"
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
  FixedDecimal: fixedDecimalSchema,
  EpochStatus: epochStatusSchema,
  Epoch: epochSchema,
  CurrentEpochResponse: currentEpochResponseSchema,
  VoterKind: voterKindSchema,
  BoostGauge: boostGaugeSchema,
  PoolGauge: poolGaugeSchema,
  ValidatorGauge: validatorGaugeSchema,
  ThirdPartyGauge: thirdPartyGaugeSchema,
  Gauge: gaugeSchema,
  RewardKind: rewardKindSchema,
  Reward: rewardSchema,
  GaugeIncentives: gaugeIncentivesSchema,
  PriceSource: priceSourceSchema,
  ReferencePrice: referencePriceSchema,
  MarketPrices: marketMetaSchema.shape.prices,
  VoterTotalWeights: voterTotalWeightsSchema,
  MarketMeta: marketMetaSchema,
  GaugeList: gaugeListSchema,
  GaugeDetail: gaugeDetailSchema,
  IncentiveList: incentiveListSchema,
  GaugeEpoch: gaugeEpochSchema,
  GaugeEpochList: gaugeEpochListSchema,
  ErrorCode: errorCodeSchema,
  ErrorBody: errorBodySchema,
} as const satisfies Record<string, z.ZodType>

type ComponentName = keyof typeof componentSchemas

function componentRef(name: ComponentName): JsonSchema {
  return { $ref: `#/components/schemas/${name}` }
}

function isJsonSchema(value: unknown): value is JsonSchema {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

type ComponentDocs = {
  description?: string
  properties?: Record<string, string>
}

const weightDescription =
  "Voting power on this gauge in base units (18 decimals); `null` if unread."

const gaugeDocs: ComponentDocs = { properties: { weight: weightDescription } }

/**
 * Descriptions for the market schemas, mirroring the doc comments in
 * `market.ts` (zod `.meta()` there would make these unnecessary).
 */
const componentDocs: Partial<Record<ComponentName, ComponentDocs>> = {
  FixedDecimal: {
    description:
      "Non-negative decimal string with an optional fraction (USD, multipliers, percentages).",
  },
  Epoch: {
    description:
      "A Mezo Earn epoch in unix seconds: one week from Thursday 00:00 UTC, the same on every network.",
    properties: {
      voteStart: "Votes open one hour into the epoch.",
      voteEnd: "Votes close one hour before the epoch ends.",
    },
  },
  VoterKind: {
    description:
      "The four Mezo Earn voters. `boost` and `third-party` count veMEZO voting power; `pools` and `validators` count veBTC voting power.",
  },
  BoostGauge: {
    properties: {
      weight: weightDescription,
      vebtcTokenId: "The veBTC lock this gauge boosts.",
      beneficiary:
        "Receives the gauge's emissions (the veBTC owner at creation).",
      boostMultiplier:
        '`BoostVoter.getBoost`, e.g. "1.25" for 1.25x; between 1 and 5.',
    },
  },
  PoolGauge: gaugeDocs,
  ValidatorGauge: gaugeDocs,
  ThirdPartyGauge: gaugeDocs,
  RewardKind: {
    description:
      "`bribe` = voting incentives; `fees` = pool trading fees (pools only).",
  },
  Reward: {
    properties: {
      amount: "`tokenRewardsPerEpoch(token, epoch.start)` in token base units.",
      usd: "USD value of `amount`; `null` when the token has no registry price.",
    },
  },
  GaugeIncentives: {
    description: "One gauge's rewards for one epoch.",
    properties: {
      weight: weightDescription,
      totalUsd: "Sum of priced rewards; `null` when none is priced.",
      unpricedRewards:
        "Rewards left out of `totalUsd` because their token has no price.",
      aprPercent:
        "Annualizes `totalUsd` against the gauge's voting power valued at the voting token's price (MEZO for veMEZO voters, BTC for veBTC voters): `totalUsd * 52 / (weight / 1e18 * votingTokenUsd) * 100`. `null` with no priced rewards, no weight or no voting-token price.",
    },
  },
  PriceSource: {
    description:
      "`skip-oracle`: Skip Connect BTC/USD oracle on Mezo. `aerodrome-cl`: Aerodrome Slipstream MEZO/MUSD pool on Base. `stablecoin`: registry stablecoin at $1. `btc-pegged`: registry BTC-pegged token at the BTC price. `mezo`: the MEZO token at the MEZO price.",
  },
  MarketMeta: {
    description:
      "Where and when the data was read. Market data is a snapshot refreshed about every 5 minutes, not live.",
    properties: {
      blockNumber: "Mezo block the snapshot was read at.",
      asOf: "When the snapshot was read.",
    },
  },
  GaugeEpoch: {
    description:
      "One epoch of a gauge's history, as last snapshotted in that epoch.",
  },
}

/** Applies `componentDocs`; throws when a documented property is gone. */
function documentComponents(components: Record<string, JsonSchema>): void {
  for (const [name, docs] of Object.entries(componentDocs)) {
    const component = components[name]
    if (component === undefined) throw new Error(`No component ${name}`)
    if (docs.description !== undefined) {
      component.description = docs.description
    }
    const properties = component.properties
    for (const [property, description] of Object.entries(
      docs.properties ?? {},
    )) {
      const schema = isJsonSchema(properties) ? properties[property] : null
      if (!isJsonSchema(properties) || !isJsonSchema(schema)) {
        throw new Error(`${name} has no property ${property}`)
      }
      properties[property] = { ...schema, description }
    }
  }
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
  const gauge = components.Gauge
  if (gauge !== undefined) {
    gauge.discriminator = {
      propertyName: "voter",
      mapping: {
        boost: "#/components/schemas/BoostGauge",
        pools: "#/components/schemas/PoolGauge",
        validators: "#/components/schemas/ValidatorGauge",
        "third-party": "#/components/schemas/ThirdPartyGauge",
      },
    }
  }
  documentComponents(components)
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

const marketErrorResponses = {
  ...authenticatedErrorResponses,
  "503": { $ref: "#/components/responses/MarketUnavailable" },
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
    "`mezo` or `mezo-testnet`; every key reads both. Other values return 403 `network_not_allowed`.",
  schema: componentRef("NetworkSlug"),
}

const networkQueryParameter = {
  name: "network",
  in: "query",
  required: true,
  description: "`mezo` or `mezo-testnet`; every key reads both.",
  schema: componentRef("NetworkSlug"),
}

const gaugeAddressPathParameter = {
  name: "gaugeAddress",
  in: "path",
  required: true,
  description: "Gauge contract address (any case).",
  schema: parameterSchema(z.string().regex(/^0x[0-9a-fA-F]{40}$/)),
}

const voterQueryParameter = {
  name: "voter",
  in: "query",
  required: false,
  schema: componentRef("VoterKind"),
}

const gaugeQueryParameter = {
  name: "gauge",
  in: "query",
  required: false,
  description: `Gauge addresses (repeatable or comma-separated, up to ${marketMaxGaugeFilters}).`,
  style: "form",
  explode: true,
  schema: {
    type: "array",
    minItems: 1,
    maxItems: marketMaxGaugeFilters,
    items: parameterSchema(addressInputSchema),
  },
}

const snapshotDescription =
  "Data is a snapshot refreshed about every 5 minutes; see `meta.asOf` and `meta.blockNumber`."

const securityDescription = [
  "Send `Authorization: Bearer <key>`.",
  "",
  "- **Publishable keys** (`mbx_pk_test_…`, `mbx_pk_live_…`) are safe in browsers. The request `Origin` must be registered on the key's environment.",
  "- **Secret keys** (`mbx_sk_test_…`, `mbx_sk_live_…`) are server-only. Requests carrying an `Origin` header are rejected; an optional CIDR allowlist applies.",
  "",
  "Test and live keys both read `mezo` and `mezo-testnet`. Live keys require an approved environment and get higher rate limits. Revocation takes effect within 15 seconds.",
].join("\n")

export function createOpenApiDocument() {
  return {
    openapi: "3.1.0",
    jsonSchemaDialect: "https://json-schema.org/draft/2020-12/schema",
    info: {
      title: "Matchbox API",
      version: publicApiVersion,
      description:
        "Read Mezo Earn market data and Matchbox gauge profiles: every gauge across the four voters, per-epoch incentives with USD values and APRs, epoch timing, and curated profiles for boost and validator gauges. Market data is a snapshot refreshed about every 5 minutes. Generated from `@repo/platform-contracts`.",
      contact: { url: "https://developer.matchbox.markets" },
    },
    servers: [{ url: publicApiServerUrl }],
    security: [{ bearerAuth: [] }],
    tags: [
      { name: "Meta" },
      { name: "Networks" },
      { name: "Epochs" },
      { name: "Gauges" },
      { name: "Incentives" },
      { name: "Gauge profiles" },
    ],
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
              description: "`mezo` or `mezo-testnet`; every key reads both.",
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
              description: "Only profiles with this tag (a lower-case slug).",
              schema: parameterSchema(gaugeProfileTagFilterSchema),
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
      "/v1/epochs/current": {
        get: {
          operationId: "getCurrentEpoch",
          tags: ["Epochs"],
          summary: "Current and next epoch",
          description:
            "Mezo Earn epochs last one week from Thursday 00:00 UTC. Votes open one hour after the start and close one hour before the end. Unix seconds, the same on every network.",
          parameters: [ifNoneMatchParameter],
          responses: {
            "200": okResponse(
              "The current and next epoch.",
              "CurrentEpochResponse",
            ),
            "304": notModifiedResponse,
            ...authenticatedErrorResponses,
          },
        },
      },
      "/v1/gauges": {
        get: {
          operationId: "listGauges",
          tags: ["Gauges"],
          summary: "List gauges",
          description: `Every gauge on the network across the four voters, in one response (no pagination; about 780 on \`mezo\`). \`voter\` discriminates the variants. ${snapshotDescription}`,
          parameters: [
            networkQueryParameter,
            voterQueryParameter,
            {
              name: "alive",
              in: "query",
              required: false,
              description: "Only gauges whose `isAlive` matches.",
              schema: parameterSchema(
                gaugeListQuerySchema.shape.alive.unwrap(),
              ),
            },
            gaugeQueryParameter,
            ifNoneMatchParameter,
          ],
          responses: {
            "200": okResponse("Every matching gauge.", "GaugeList"),
            "304": notModifiedResponse,
            ...marketErrorResponses,
          },
        },
      },
      "/v1/gauges/{network}/{gaugeAddress}": {
        get: {
          operationId: "getGauge",
          tags: ["Gauges"],
          summary: "Get a gauge",
          description: snapshotDescription,
          parameters: [
            networkPathParameter,
            gaugeAddressPathParameter,
            ifNoneMatchParameter,
          ],
          responses: {
            "200": okResponse("The gauge.", "GaugeDetail"),
            "304": notModifiedResponse,
            "404": { $ref: "#/components/responses/NotFound" },
            ...marketErrorResponses,
          },
        },
      },
      "/v1/gauges/{network}/{gaugeAddress}/epochs": {
        get: {
          operationId: "listGaugeEpochs",
          tags: ["Gauges"],
          summary: "List a gauge's epochs",
          description:
            "The gauge's incentives, weight and prices per epoch as last snapshotted in that epoch, newest first. History starts when Matchbox began snapshotting.",
          parameters: [
            networkPathParameter,
            gaugeAddressPathParameter,
            {
              name: "limit",
              in: "query",
              required: false,
              description: "Epochs to return, newest first.",
              schema: {
                type: "integer",
                minimum: 1,
                maximum: gaugeEpochsMaxLimit,
                default: gaugeEpochsDefaultLimit,
              },
            },
            ifNoneMatchParameter,
          ],
          responses: {
            "200": okResponse("The gauge's epochs.", "GaugeEpochList"),
            "304": notModifiedResponse,
            "404": { $ref: "#/components/responses/NotFound" },
            ...marketErrorResponses,
          },
        },
      },
      "/v1/vebtc/{network}/{tokenId}/gauge": {
        get: {
          operationId: "getGaugeByVebtc",
          tags: ["Gauges"],
          summary: "Get the boost gauge for a veBTC token",
          description: `The boost gauge whose \`vebtcTokenId\` is this token; 404 when the token has none. ${snapshotDescription}`,
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
            "200": okResponse("The boost gauge.", "GaugeDetail"),
            "304": notModifiedResponse,
            "404": { $ref: "#/components/responses/NotFound" },
            ...marketErrorResponses,
          },
        },
      },
      "/v1/incentives": {
        get: {
          operationId: "listIncentives",
          tags: ["Incentives"],
          summary: "List incentives for an epoch",
          description: [
            "Gauges with at least one non-zero reward for the epoch: voting incentives (`bribe`) and pool trading fees (`fees`), in token base units.",
            "`usd` is `null` for tokens without a registry price; `totalUsd` sums the priced rewards and `unpricedRewards` counts the rest.",
            "`aprPercent` annualizes `totalUsd` against the gauge's voting power valued at the voting token's price (MEZO for veMEZO voters, BTC for veBTC voters): `totalUsd * 52 / (weight / 1e18 * votingTokenUsd) * 100`. It is `null` with no priced rewards, no weight or no voting-token price.",
            snapshotDescription,
          ].join("\n\n"),
          parameters: [
            networkQueryParameter,
            {
              name: "epoch",
              in: "query",
              required: false,
              description: `\`current\` (the newest snapshot up to now; see \`meta.epoch\`), \`next\`, or an epoch start in unix seconds (a multiple of ${epochSeconds}).`,
              schema: {
                anyOf: [
                  { type: "string", enum: ["current", "next"] },
                  { type: "string", pattern: "^[0-9]{1,12}$" },
                ],
                default: "current",
              },
            },
            voterQueryParameter,
            gaugeQueryParameter,
            ifNoneMatchParameter,
          ],
          responses: {
            "200": okResponse(
              "Gauges with rewards for the epoch.",
              "IncentiveList",
            ),
            "304": notModifiedResponse,
            "404": errorResponse("`not_found`: no snapshot for that epoch."),
            ...marketErrorResponses,
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
        MarketUnavailable: errorResponse(
          "`service_disabled`: the API is temporarily off, or no market snapshot exists yet for this network.",
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
