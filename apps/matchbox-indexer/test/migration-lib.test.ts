import { describe, expect, it } from "vitest"
import { migrationChecksum } from "../scripts/migration-lib"

describe("migration checksums", () => {
  it("changes when immutable migration contents change", () => {
    expect(migrationChecksum("SELECT 1")).not.toBe(
      migrationChecksum("SELECT 2"),
    )
  })

  it("is stable for identical migration contents", () => {
    expect(migrationChecksum("SELECT 1")).toBe(migrationChecksum("SELECT 1"))
  })
})
