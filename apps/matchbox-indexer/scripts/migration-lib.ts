import { createHash } from "node:crypto"
import { readFile, readdir } from "node:fs/promises"
import { join } from "node:path"

export type MigrationFile = {
  filename: string
  checksum: string
  sql: string
}

export function migrationChecksum(sql: string): string {
  return createHash("sha256").update(sql).digest("hex")
}

export async function readMigrations(
  directory: string,
): Promise<MigrationFile[]> {
  const filenames = (await readdir(directory))
    .filter((filename) => filename.endsWith(".sql"))
    .sort()

  return Promise.all(
    filenames.map(async function loadMigration(filename) {
      const sql = await readFile(join(directory, filename), "utf8")
      return { filename, checksum: migrationChecksum(sql), sql }
    }),
  )
}
