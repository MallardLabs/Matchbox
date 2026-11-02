import { purgeExpiredNonces } from "./expiredNonces.ts"

function assertEquals(actual: string, expected: string, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, received ${actual}`)
  }
}

type Row = { nonce_hash: string; expires_at: string }

// Just enough of the supabase-js query builder for the purge.
function fakeSupabase(rows: Row[], options: { failSelect?: boolean } = {}) {
  const calls: string[] = []
  const client = {
    from: (table: string) => {
      let expiredBefore = ""
      let limit = Number.POSITIVE_INFINITY
      const select = {
        lt: (_column: string, value: string) => {
          expiredBefore = value
          return select
        },
        order: () => select,
        limit: (count: number) => {
          limit = count
          if (options.failSelect) {
            return Promise.resolve({ data: null, error: { code: "XX000" } })
          }
          const data = rows
            .filter((row) => row.expires_at < expiredBefore)
            .sort((a, b) => a.expires_at.localeCompare(b.expires_at))
            .slice(0, limit)
          return Promise.resolve({ data, error: null })
        },
      }
      return {
        select: () => {
          calls.push(`select ${table}`)
          return select
        },
        delete: () => ({
          in: (_column: string, hashes: string[]) => {
            calls.push(`delete ${table} ${hashes.length}`)
            for (const hash of hashes) {
              const index = rows.findIndex((row) => row.nonce_hash === hash)
              if (index >= 0) rows.splice(index, 1)
            }
            return Promise.resolve({ error: null })
          },
        }),
      }
    },
  }
  return {
    calls,
    client: client as unknown as Parameters<typeof purgeExpiredNonces>[0],
  }
}

const now = new Date("2026-11-02T12:00:00.000Z")
const at = (minutes: number) =>
  new Date(now.getTime() + minutes * 60_000).toISOString()

Deno.test("purge deletes expired nonces in bounded batches", async () => {
  const rows: Row[] = []
  for (let i = 0; i < 120; i += 1) {
    rows.push({ nonce_hash: `expired-${i}`, expires_at: at(-1 - i) })
  }
  rows.push({ nonce_hash: "live", expires_at: at(4) })
  const { client, calls } = fakeSupabase(rows)

  await purgeExpiredNonces(client, "gauge_profile_transfer_nonces", now)
  assertEquals(String(rows.length), "71", "first batch")
  assertEquals(
    calls.join(","),
    "select gauge_profile_transfer_nonces,delete gauge_profile_transfer_nonces 50",
    "calls",
  )

  await purgeExpiredNonces(client, "gauge_profile_transfer_nonces", now)
  await purgeExpiredNonces(client, "gauge_profile_transfer_nonces", now)
  assertEquals(String(rows.length), "1", "drained")
  assertEquals(rows[0].nonce_hash, "live", "live nonce kept")
})

Deno.test("purge skips the delete when nothing expired and swallows errors", async () => {
  const rows: Row[] = [{ nonce_hash: "live", expires_at: at(4) }]
  const empty = fakeSupabase(rows)
  await purgeExpiredNonces(empty.client, "gauge_profile_write_nonces", now)
  assertEquals(
    empty.calls.join(","),
    "select gauge_profile_write_nonces",
    "calls",
  )

  const failing = fakeSupabase(rows, { failSelect: true })
  await purgeExpiredNonces(failing.client, "gauge_profile_write_nonces", now)
  assertEquals(String(rows.length), "1", "rows")
})
