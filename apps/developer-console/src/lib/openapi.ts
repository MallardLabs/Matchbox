import { z } from "zod"

/**
 * Minimal typed view of the public OpenAPI 3.1 document
 * (`@repo/platform-contracts/openapi.json`) for the docs renderer.
 */

export type JsonSchema = Record<string, unknown>

const jsonSchema = z.record(z.string(), z.unknown())

const refSchema = z.object({ $ref: z.string() })

const parameterSchema = z.object({
  name: z.string(),
  in: z.enum(["query", "path", "header", "cookie"]),
  required: z.boolean().optional(),
  description: z.string().optional(),
  schema: jsonSchema.optional(),
})

export type Parameter = z.infer<typeof parameterSchema>

const headerSchema = z.object({
  description: z.string().optional(),
  schema: jsonSchema.optional(),
})

const responseSchema = z.object({
  description: z.string(),
  headers: z.record(z.string(), headerSchema).optional(),
  content: z.record(z.string(), z.object({ schema: jsonSchema })).optional(),
})

export type ResponseObject = z.infer<typeof responseSchema>

const operationSchema = z.object({
  operationId: z.string(),
  tags: z.array(z.string()).default([]),
  summary: z.string().optional(),
  description: z.string().optional(),
  security: z.array(z.record(z.string(), z.array(z.string()))).optional(),
  parameters: z.array(parameterSchema).default([]),
  responses: z.record(z.string(), z.union([refSchema, responseSchema])),
})

export const httpMethods = ["get", "post", "put", "patch", "delete"] as const

export type HttpMethod = (typeof httpMethods)[number]

const pathItemSchema = z.object({
  get: operationSchema.optional(),
  post: operationSchema.optional(),
  put: operationSchema.optional(),
  patch: operationSchema.optional(),
  delete: operationSchema.optional(),
})

const documentSchema = z.object({
  openapi: z.string(),
  info: z.object({
    title: z.string(),
    version: z.string(),
    description: z.string().optional(),
  }),
  servers: z.array(z.object({ url: z.string() })).default([]),
  tags: z
    .array(z.object({ name: z.string(), description: z.string().optional() }))
    .default([]),
  paths: z.record(z.string(), pathItemSchema),
  components: z
    .object({
      schemas: z.record(z.string(), jsonSchema).default({}),
      responses: z.record(z.string(), responseSchema).default({}),
    })
    .default({ schemas: {}, responses: {} }),
})

export type OpenApiDocument = z.infer<typeof documentSchema>

export type Endpoint = {
  id: string
  method: HttpMethod
  path: string
  operationId: string
  summary: string
  description: string | null
  authenticated: boolean
  parameters: Parameter[]
  responses: Array<{
    status: string
    response: ResponseObject
    ref: string | null
  }>
}

export type EndpointGroup = { tag: string; endpoints: Endpoint[] }

export function parseOpenApi(input: unknown): OpenApiDocument {
  return documentSchema.parse(input)
}

function refName(ref: string): string {
  return ref.split("/").at(-1) ?? ref
}

export function endpointAnchor(method: string, path: string): string {
  return `${method}-${path}`
    .replaceAll(/[{}]/g, "")
    .replaceAll(/[^a-zA-Z0-9]+/g, "-")
    .replaceAll(/^-|-$/g, "")
    .toLowerCase()
}

/** Every operation, grouped by its first tag in document tag order. */
export function groupEndpoints(document: OpenApiDocument): EndpointGroup[] {
  const groups = new Map<string, Endpoint[]>()
  for (const tag of document.tags) groups.set(tag.name, [])
  for (const [path, item] of Object.entries(document.paths)) {
    for (const method of httpMethods) {
      const operation = item[method]
      if (operation === undefined) continue
      const tag = operation.tags[0] ?? "Other"
      const responses = Object.entries(operation.responses).map(
        ([status, value]) => {
          if ("$ref" in value) {
            const name = refName(value.$ref)
            const resolved = document.components.responses[name]
            return {
              status,
              ref: name,
              response: resolved ?? { description: name },
            }
          }
          return { status, ref: null, response: value }
        },
      )
      const endpoint: Endpoint = {
        id: endpointAnchor(method, path),
        method,
        path,
        operationId: operation.operationId,
        summary: operation.summary ?? operation.operationId,
        description: operation.description ?? null,
        authenticated:
          operation.security === undefined || operation.security.length > 0,
        parameters: operation.parameters,
        responses,
      }
      groups.set(tag, [...(groups.get(tag) ?? []), endpoint])
    }
  }
  return [...groups.entries()]
    .filter(([, endpoints]) => endpoints.length > 0)
    .map(([tag, endpoints]) => ({ tag, endpoints }))
}

export function resolveSchema(
  schema: JsonSchema,
  document: OpenApiDocument,
): { name: string | null; schema: JsonSchema } {
  const ref = schema.$ref
  if (typeof ref === "string") {
    const name = refName(ref)
    return { name, schema: document.components.schemas[name] ?? {} }
  }
  return { name: null, schema }
}

function schemaList(value: unknown): JsonSchema[] {
  const parsed = z.array(jsonSchema).safeParse(value)
  return parsed.success ? parsed.data : []
}

function isNullSchema(schema: JsonSchema): boolean {
  return schema.type === "null"
}

/** `anyOf: [X, {type: null}]` -> X plus nullable. */
export function unwrapNullable(schema: JsonSchema): {
  schema: JsonSchema
  nullable: boolean
} {
  const options = schemaList(schema.anyOf ?? schema.oneOf)
  const nonNull = options.filter((option) => !isNullSchema(option))
  if (options.length > 1 && nonNull.length === 1 && nonNull[0] !== undefined) {
    return { schema: nonNull[0], nullable: true }
  }
  return { schema, nullable: false }
}

export function schemaVariants(schema: JsonSchema): JsonSchema[] {
  return schemaList(schema.oneOf ?? schema.anyOf).filter(
    (option) => !isNullSchema(option),
  )
}

export function objectProperties(
  schema: JsonSchema,
): Array<{ name: string; schema: JsonSchema; required: boolean }> {
  const properties = jsonSchema.safeParse(schema.properties)
  if (!properties.success) return []
  const required = z.array(z.string()).safeParse(schema.required)
  const requiredNames = new Set(required.success ? required.data : [])
  return Object.entries(properties.data).map(([name, value]) => {
    const parsed = jsonSchema.safeParse(value)
    return {
      name,
      schema: parsed.success ? parsed.data : {},
      required: requiredNames.has(name),
    }
  })
}

export function arrayItems(schema: JsonSchema): JsonSchema | null {
  const parsed = jsonSchema.safeParse(schema.items)
  return parsed.success ? parsed.data : null
}

export function enumValues(schema: JsonSchema): string[] | null {
  const parsed = z
    .array(z.union([z.string(), z.number()]))
    .safeParse(schema.enum)
  return parsed.success ? parsed.data.map(String) : null
}

/** Short type label, e.g. `string · date-time`, `NetworkSlug`, `array<Address>`. */
export function typeLabel(
  schema: JsonSchema,
  document: OpenApiDocument,
): string {
  const { name, schema: resolved } = resolveSchema(schema, document)
  if (name !== null) return name
  const { schema: inner, nullable } = unwrapNullable(resolved)
  if (inner !== resolved) return `${typeLabel(inner, document)} | null`
  const variants = schemaVariants(resolved)
  if (variants.length > 0) {
    return variants.map((variant) => typeLabel(variant, document)).join(" | ")
  }
  if (resolved.const !== undefined) return JSON.stringify(resolved.const)
  const values = enumValues(resolved)
  if (values !== null)
    return values.map((value) => JSON.stringify(value)).join(" | ")
  const type = typeof resolved.type === "string" ? resolved.type : "object"
  if (type === "array") {
    const items = arrayItems(resolved)
    return `array<${items === null ? "unknown" : typeLabel(items, document)}>`
  }
  const format =
    typeof resolved.format === "string" ? ` · ${resolved.format}` : ""
  return `${type}${format}${nullable ? " | null" : ""}`
}

const exampleAddress = "0x8f3cf7ad23cd3cadbd9735aff958023239c6a063"

/** A plausible example value generated from the schema's real fields. */
export function exampleValue(
  schema: JsonSchema,
  document: OpenApiDocument,
  depth = 0,
): unknown {
  if (depth > 8) return null
  const { schema: resolved } = resolveSchema(schema, document)
  if (resolved.const !== undefined) return resolved.const
  if (resolved.default !== undefined) return resolved.default
  const values = enumValues(resolved)
  if (values !== null) return values[0] ?? null
  const { schema: inner, nullable } = unwrapNullable(resolved)
  if (nullable) return exampleValue(inner, document, depth + 1)
  const variants = schemaVariants(resolved)
  if (variants[0] !== undefined)
    return exampleValue(variants[0], document, depth + 1)
  switch (resolved.type) {
    case "object": {
      const properties = objectProperties(resolved)
      if (properties.length === 0) return {}
      return Object.fromEntries(
        properties.map((property) => [
          property.name,
          exampleValue(property.schema, document, depth + 1),
        ]),
      )
    }
    case "array": {
      const items = arrayItems(resolved)
      return items === null ? [] : [exampleValue(items, document, depth + 1)]
    }
    case "integer":
    case "number":
      return typeof resolved.minimum === "number" ? resolved.minimum : 1
    case "boolean":
      return true
    case "string": {
      if (resolved.format === "date-time") return "2026-09-30T12:00:00.000Z"
      if (resolved.format === "uri") return "https://example.com"
      const pattern =
        typeof resolved.pattern === "string" ? resolved.pattern : ""
      if (pattern.includes("0x")) return exampleAddress
      if (pattern.includes("[1-9]")) return "1234"
      return "string"
    }
    default:
      return typeof resolved.properties === "object"
        ? exampleValue({ ...resolved, type: "object" }, document, depth + 1)
        : null
  }
}

/** Example value for a path/query parameter. */
export function parameterExample(
  parameter: Parameter,
  document: OpenApiDocument,
  network: string,
): string {
  if (parameter.name === "network") return network
  if (parameter.name === "gaugeAddress") return exampleAddress
  if (parameter.name === "tokenId") return "1234"
  const value = exampleValue(parameter.schema ?? {}, document)
  if (Array.isArray(value)) return String(value[0] ?? "")
  return typeof value === "string" ? value : JSON.stringify(value)
}

/** Concrete URL for an endpoint using required parameters only. */
export function exampleUrl(
  endpoint: Endpoint,
  document: OpenApiDocument,
  network: string,
): string {
  const server = document.servers[0]?.url ?? ""
  let path = endpoint.path
  for (const parameter of endpoint.parameters) {
    if (parameter.in !== "path") continue
    path = path.replace(
      `{${parameter.name}}`,
      encodeURIComponent(parameterExample(parameter, document, network)),
    )
  }
  const query = new URLSearchParams()
  for (const parameter of endpoint.parameters) {
    if (parameter.in === "query" && parameter.required === true) {
      query.set(parameter.name, parameterExample(parameter, document, network))
    }
  }
  const search = query.toString()
  return `${server}${path}${search === "" ? "" : `?${search}`}`
}
