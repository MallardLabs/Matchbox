import { createRequire } from "node:module"
import { pathToFileURL } from "node:url"
import openapiTS, { COMMENT_HEADER, astToString } from "openapi-typescript"

/** Absolute path of the checked-in OpenAPI document. */
export function openApiDocumentPath(): string {
  return createRequire(import.meta.url).resolve(
    "@repo/platform-contracts/openapi.json",
  )
}

/** `src/generated/schema.ts` content for the current OpenAPI document. */
export async function renderSchemaTypes(): Promise<string> {
  const ast = await openapiTS(pathToFileURL(openApiDocumentPath()), {
    alphabetize: false,
    exportType: true,
  })
  const header = `${COMMENT_HEADER}// Source: @repo/platform-contracts/openapi.json\n// Regenerate: pnpm --filter @matchbox-markets/sdk generate\n\n`
  return `${header}${astToString(ast)}`
}

/** Line-ending-insensitive comparison (Windows checkouts may use CRLF). */
export function normalizeNewlines(value: string): string {
  return value.replaceAll("\r\n", "\n")
}
