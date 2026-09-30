import { format } from "prettier"
import { serializeOpenApiDocument } from "../src/openapi"

export const openApiJsonPath = new URL("../openapi.json", import.meta.url)

/** The exact bytes expected in `openapi.json` (prettier-formatted JSON). */
export async function formatOpenApiJson(): Promise<string> {
  return format(serializeOpenApiDocument(), { parser: "json" })
}
