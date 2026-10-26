/// <reference types="node" />
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import type { SQLInputValue } from "node:sqlite"
import { fileURLToPath } from "node:url"
import type { MarketDatabase, MarketStatement } from "./store"

/**
 * Test-only `MarketDatabase` on an in-memory `node:sqlite` database with the
 * real D1 migrations applied, so the D1 store's SQL runs in unit tests.
 */

const migrations = ["0001_market.sql"]

// Vite 5 does not know the prefix-only `node:sqlite` builtin, so load it
// through Node's own resolver instead of an import.
const { DatabaseSync }: typeof import("node:sqlite") = createRequire(
  import.meta.url,
)("node:sqlite")

function sqlValue(value: unknown): SQLInputValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "bigint"
  ) {
    return value
  }
  throw new Error(`Unsupported SQL binding: ${typeof value}`)
}

export default function createSqliteMarketDatabase(): MarketDatabase {
  const db = new DatabaseSync(":memory:")
  for (const name of migrations) {
    db.exec(
      readFileSync(
        fileURLToPath(
          new URL(`../../migrations/${name}`, import.meta.url).href,
        ),
        "utf8",
      ),
    )
  }

  function statement(sql: string, values: SQLInputValue[]): MarketStatement {
    return {
      bind(...next) {
        return statement(sql, next.map(sqlValue))
      },
      async first() {
        const row = db.prepare(sql).get(...values)
        return row === undefined ? null : { ...row }
      },
      async all() {
        return {
          results: db
            .prepare(sql)
            .all(...values)
            .map((row) => ({ ...row })),
        }
      },
      async run() {
        return db.prepare(sql).run(...values)
      },
    }
  }

  return {
    prepare(sql) {
      return statement(sql, [])
    },
    async batch(statements) {
      db.exec("BEGIN")
      try {
        for (const item of statements) await item.run()
        db.exec("COMMIT")
      } catch (error) {
        db.exec("ROLLBACK")
        throw error
      }
    },
  }
}
