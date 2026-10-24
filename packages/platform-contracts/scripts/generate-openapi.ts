import { writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { formatOpenApiJson, openApiJsonPath } from "./openapi-file"

async function main(): Promise<void> {
  const formatted = await formatOpenApiJson()
  await writeFile(openApiJsonPath, formatted, "utf8")
  process.stdout.write(`Wrote ${fileURLToPath(openApiJsonPath)}\n`)
}

main().catch((error: unknown) => {
  process.stderr.write(`${String(error)}\n`)
  process.exitCode = 1
})
