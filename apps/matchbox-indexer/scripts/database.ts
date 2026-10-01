import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { createLogger } from "@repo/shared/logger"
import dotenv from "dotenv"
import { Pool } from "pg"
import { z } from "zod"

export const repositoryRoot = fileURLToPath(
  new URL("../../..", import.meta.url),
)

dotenv.config({ path: resolve(repositoryRoot, ".env.local") })
dotenv.config({ path: resolve(repositoryRoot, ".env") })

const logger = createLogger("matchbox-indexer-database")

const postgresUrlSchema = z
  .url()
  .refine(
    (value) =>
      value.startsWith("postgres://") || value.startsWith("postgresql://"),
    "Expected a PostgreSQL connection string",
  )

export function loadDirectDatabaseUrl(): string {
  const candidate =
    process.env.MATCHBOX_DATABASE_URL_UNPOOLED ??
    process.env.DATABASE_URL_UNPOOLED ??
    process.env.MATCHBOX_DATABASE_URL ??
    process.env.DATABASE_URL
  const databaseUrl = postgresUrlSchema.parse(candidate)
  const hostname = new URL(databaseUrl).hostname

  if (hostname.includes("-pooler")) {
    throw new Error(
      "Migrations and role setup require a direct Neon URL, not a pooled endpoint.",
    )
  }

  const normalizedUrl = new URL(databaseUrl)
  if (normalizedUrl.searchParams.get("sslmode") === "require") {
    normalizedUrl.searchParams.set("sslmode", "verify-full")
  }

  logger.info({ message: "Using direct PostgreSQL endpoint", hostname })
  return normalizedUrl.toString()
}

export function createDatabasePool(): Pool {
  return new Pool({
    connectionString: loadDirectDatabaseUrl(),
    max: 1,
    application_name: "matchbox-indexed-data-phase-a",
  })
}
