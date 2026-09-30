import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { normalizeNewlines, renderSchemaTypes } from "../scripts/render-types"

describe("generated OpenAPI types", () => {
  it("match packages/platform-contracts/openapi.json (run `pnpm generate`)", async () => {
    const checkedIn = readFileSync(
      fileURLToPath(new URL("./generated/schema.ts", import.meta.url)),
      "utf8",
    )
    expect(normalizeNewlines(checkedIn)).toBe(
      normalizeNewlines(await renderSchemaTypes()),
    )
  }, 30_000)
})
