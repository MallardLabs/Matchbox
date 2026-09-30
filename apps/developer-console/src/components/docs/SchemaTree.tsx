import * as Badge from "@repo/ui/badge"
import type { ReactElement } from "react"
import {
  type JsonSchema,
  type OpenApiDocument,
  arrayItems,
  objectProperties,
  resolveSchema,
  schemaVariants,
  typeLabel,
  unwrapNullable,
} from "../../lib/openapi"

type SchemaTreeProps = {
  schema: JsonSchema
  document: OpenApiDocument
  depth?: number
}

const maxDepth = 5

/** Children worth expanding: object properties, array items, variants. */
function expandable(
  schema: JsonSchema,
  document: OpenApiDocument,
): JsonSchema | null {
  const { schema: resolved } = resolveSchema(schema, document)
  const { schema: inner } = unwrapNullable(resolved)
  const target = resolveSchema(inner, document).schema
  if (objectProperties(target).length > 0) return target
  if (schemaVariants(target).length > 1) return target
  const items = arrayItems(target)
  if (items !== null) {
    const itemSchema = resolveSchema(items, document).schema
    if (
      objectProperties(itemSchema).length > 0 ||
      schemaVariants(itemSchema).length > 1
    ) {
      return itemSchema
    }
  }
  return null
}

/** Nested property list for a response/parameter schema. */
export default function SchemaTree({
  schema,
  document,
  depth = 0,
}: SchemaTreeProps): ReactElement {
  const { schema: resolved } = resolveSchema(schema, document)
  const variants = schemaVariants(resolved)
  if (variants.length > 1) {
    return (
      <ol className="m-0 flex list-none flex-col gap-3 p-0">
        {variants.map((variant, index) => (
          <li
            key={typeLabel(variant, document)}
            className="flex flex-col gap-2"
          >
            <p className="text-[11px] font-650 uppercase tracking-[0.04em] text-secondary">
              {index === 0 ? "One of" : "Or"}{" "}
              <span className="font-mono normal-case tracking-normal text-ink">
                {typeLabel(variant, document)}
              </span>
            </p>
            {depth < maxDepth ? (
              <SchemaTree
                schema={variant}
                document={document}
                depth={depth + 1}
              />
            ) : null}
          </li>
        ))}
      </ol>
    )
  }
  const properties = objectProperties(resolved)
  if (properties.length === 0) {
    return (
      <p className="font-mono text-[12px] text-secondary">
        {typeLabel(schema, document)}
      </p>
    )
  }
  return (
    <ul className="m-0 flex list-none flex-col p-0">
      {properties.map((property) => {
        const child =
          depth < maxDepth ? expandable(property.schema, document) : null
        const { schema: propertySchema } = resolveSchema(
          property.schema,
          document,
        )
        const description =
          typeof propertySchema.description === "string"
            ? propertySchema.description
            : null
        return (
          <li
            key={property.name}
            className="border-t border-line py-2 first:border-t-0"
          >
            <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <code className="font-mono text-[12px] font-500 text-ink">
                {property.name}
              </code>
              <span className="font-mono text-[11px] text-secondary">
                {typeLabel(property.schema, document)}
              </span>
              {property.required ? null : <Badge.Root>optional</Badge.Root>}
            </p>
            {description === null ? null : (
              <p className="mt-0.5 text-[12px] text-secondary">{description}</p>
            )}
            {child === null ? null : (
              <div className="mt-2 border-l border-line pl-3">
                <SchemaTree
                  schema={child}
                  document={document}
                  depth={depth + 1}
                />
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
