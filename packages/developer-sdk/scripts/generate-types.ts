import { writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { renderSchemaTypes } from "./render-types"

const target = fileURLToPath(
  new URL("../src/generated/schema.ts", import.meta.url),
)

writeFileSync(target, await renderSchemaTypes())
process.stdout.write(`Wrote ${target}\n`)
