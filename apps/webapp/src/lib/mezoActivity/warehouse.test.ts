import assert from "node:assert/strict"
import { afterEach, test } from "node:test"
import { mapActivityEventRow } from "@/lib/mezoActivity/activityEvent"
import { buildThirdPartyRewardQuery } from "@/lib/mezoGauges/warehouse"
import {
  WAREHOUSE_CACHE_SECONDS,
  WAREHOUSE_TIMEOUT_MS,
  WarehouseUnavailableError,
  cacheableNow,
  cachedWarehouseRead,
  clearWarehouseCache,
  isWarehouseSource,
  parseIndexedThrough,
  queryWarehouse,
  resetWarehouseBreaker,
  warehouseReadable,
  warehouseSql,
  withWarehouseFallback,
} from "@/lib/warehouse"
import { CHAIN_ID } from "@repo/shared/contracts"
import { z } from "zod"
import { fetchMezoActivity } from "./dataSources"
import { buildActivityQuery, mapWarehouseRows } from "./warehouse"
import { PARITY_FIXTURES } from "./warehouse.fixtures"

const ENV_KEYS = ["MEZO_ACTIVITY_SOURCE", "MATCHBOX_WAREHOUSE_URL"] as const
const savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]))

const realFetch = globalThis.fetch

afterEach(() => {
  clearWarehouseCache()
  resetWarehouseBreaker()
  globalThis.fetch = realFetch
  for (const key of ENV_KEYS) {
    const value = savedEnv[key]
    if (value === undefined) Reflect.deleteProperty(process.env, key)
    else process.env[key] = value
  }
})

const BASE = {
  chainId: CHAIN_ID.mainnet,
  fromTimestamp: 1_790_000_000,
  toTimestamp: 1_790_276_693,
  limit: 50,
  page: 0,
} as const

test("buildActivityQuery filters the window and peeks one row", () => {
  const query = buildActivityQuery(BASE)
  assert.match(query.text, /"network" = \$1/)
  assert.match(query.text, /"timestamp" >= \$2/)
  assert.match(query.text, /"timestamp" <= \$3/)
  assert.match(
    query.text,
    /ORDER BY "timestamp" DESC, "block_number" DESC,\s+"log_index" DESC, "id" COLLATE "C" DESC/,
  )
  assert.match(query.text, /LIMIT \$4 OFFSET \$5/)
  assert.deepEqual(query.params, ["mezo", "1790000000", "1790276693", 51, 0])
})

test("buildActivityQuery scopes an actor to actor or recipient", () => {
  const actor = "0x7CB2EF773ACD616C3BFBB4EA03A14C91B1C3D798"
  const query = buildActivityQuery({ ...BASE, actor })
  assert.match(query.text, /\("actor" = \$4 OR "recipient" = \$4\)/)
  assert.equal(query.params[3], actor.toLowerCase())
})

test("buildActivityQuery binds every filter as a parameter", () => {
  const query = buildActivityQuery({
    ...BASE,
    page: 2,
    orderDirection: "asc",
    actionTypes: ["BOOST_VOTE", "LOCK_CREATED"],
    gauge: "0xAbC0000000000000000000000000000000000001",
    source: "VALIDATORS_VOTER",
  })
  assert.match(query.text, /"action_type" = ANY\(\$4::text\[\]\)/)
  assert.match(query.text, /"gauge" = \$5/)
  assert.match(query.text, /"source" = \$6/)
  assert.match(query.text, /"timestamp" ASC/)
  assert.deepEqual(query.params.slice(3), [
    ["BOOST_VOTE", "LOCK_CREATED"],
    "0xabc0000000000000000000000000000000000001",
    "VALIDATORS_VOTER",
    51,
    100,
  ])
  // Nothing user-supplied is interpolated into the SQL text.
  assert.doesNotMatch(query.text, /VALIDATORS_VOTER|BOOST_VOTE|0xabc/i)
})

test("buildActivityQuery selects every explorer field in explorer names", () => {
  const query = buildActivityQuery(BASE)
  assert.match(query.text, /"amount"::text AS "amount"/)
  assert.match(
    query.text,
    /"merge_dest_prev_is_permanent" AS "mergeDestPrevIsPermanent"/,
  )
  assert.match(query.text, /"timestamp"::text AS "timestamp"/)
})

test("buildActivityQuery reads only explorer-parity rows", () => {
  const query = buildActivityQuery(BASE)
  assert.match(query.text, /WHERE "network" = \$1 AND "explorer_parity" AND/)
})

test("buildActivityQuery reads the warehouse enrichments as null", () => {
  const query = buildActivityQuery(BASE)
  assert.match(
    query.text,
    /CASE WHEN "action_type" IN \('VOTE_BRIBE_CLAIMED', 'VOTE_FEE_CLAIMED'\) THEN NULL ELSE "token_id"::text END AS "tokenId"/,
  )
  assert.match(
    query.text,
    /CASE WHEN "action_type" IN \('INCENTIVE_ADDED'\) THEN NULL ELSE "epoch_start"::text END AS "epochStart"/,
  )
})

test("warehouse rows map to the same items as explorer rows", () => {
  assert.equal(PARITY_FIXTURES.length, 5)
  for (const { explorer, warehouse } of PARITY_FIXTURES) {
    const expected = mapActivityEventRow(explorer, "subgraph")
    const [actual] = mapWarehouseRows([warehouse])
    assert.ok(expected && actual, explorer.id)
    assert.deepEqual({ ...actual, source: "subgraph" }, expected, explorer.id)
    assert.equal(actual.source, "rpcLogs")
  }
})

test("unknown action types are dropped by both paths", () => {
  const [{ explorer, warehouse }] = PARITY_FIXTURES as [
    (typeof PARITY_FIXTURES)[number],
  ]
  assert.equal(
    mapActivityEventRow({ ...explorer, actionType: "NEW_THING" }, "subgraph"),
    undefined,
  )
  assert.deepEqual(
    mapWarehouseRows([{ ...warehouse, actionType: "NEW_THING" }]),
    [],
  )
})

test("isWarehouseSource is opt-in and mainnet only", () => {
  Reflect.deleteProperty(process.env, "MEZO_ACTIVITY_SOURCE")
  assert.equal(isWarehouseSource(CHAIN_ID.mainnet), false)
  process.env.MEZO_ACTIVITY_SOURCE = "warehouse"
  assert.equal(isWarehouseSource(CHAIN_ID.mainnet), true)
  assert.equal(isWarehouseSource(CHAIN_ID.testnet), false)
  process.env.MEZO_ACTIVITY_SOURCE = "explorer"
  assert.equal(isWarehouseSource(CHAIN_ID.mainnet), false)
})

test("warehouseSql refuses to run without a URL", () => {
  Reflect.deleteProperty(process.env, "MATCHBOX_WAREHOUSE_URL")
  assert.throws(() => warehouseSql(), WarehouseUnavailableError)
})

test("parseIndexedThrough reads the projection checkpoint", () => {
  assert.deepEqual(
    parseIndexedThrough([
      { block: "12219336", updatedAt: new Date("2026-10-01T16:21:29.060Z") },
    ]),
    { block: "12219336", updatedAt: "2026-10-01T16:21:29.060Z" },
  )
  assert.equal(parseIndexedThrough([]), undefined)
})

test("third-party reward query binds the window", () => {
  const query = buildThirdPartyRewardQuery({ fromTs: 1, toTs: 2 })
  assert.deepEqual(query.params, [
    "mezo",
    ["REWARD_DISTRIBUTED", "REWARD_NOTIFIED"],
    "1",
    "2",
  ])
  assert.match(query.text, /"source" = 'THIRD_PARTY_VOTER'/)
})

const rowsSchema = z.array(z.record(z.string(), z.unknown()))

test("cachedWarehouseRead serves a repeat query from the cache", async () => {
  let loads = 0
  async function load(): Promise<unknown> {
    loads += 1
    return [{ block: "1", updatedAt: new Date("2026-10-21T00:00:00.000Z") }]
  }
  const query = { text: "SELECT 1", params: ["mezo", "5"] }
  const first = await cachedWarehouseRead([query], rowsSchema, load)
  const second = await cachedWarehouseRead([query], rowsSchema, load)
  assert.equal(loads, 1)
  // A hit and a miss have the same JSON shape.
  assert.deepEqual(first, [
    { block: "1", updatedAt: "2026-10-21T00:00:00.000Z" },
  ])
  assert.deepEqual(second, first)
  await cachedWarehouseRead(
    [{ ...query, params: ["mezo", "6"] }],
    rowsSchema,
    load,
  )
  assert.equal(loads, 2)
})

test("cachedWarehouseRead never caches a failure", async () => {
  Reflect.deleteProperty(process.env, "MATCHBOX_WAREHOUSE_URL")
  const query = { text: "SELECT 2", params: [] }
  await assert.rejects(queryWarehouse(query), WarehouseUnavailableError)
  await assert.rejects(queryWarehouse(query), WarehouseUnavailableError)
})

test("cacheableNow rounds a default window end up to the cache window", () => {
  assert.equal(WAREHOUSE_CACHE_SECONDS, 300)
  assert.equal(cacheableNow(1_790_000_001), 1_790_000_100)
  assert.equal(cacheableNow(1_790_000_100), 1_790_000_100)
})

test("withWarehouseFallback reads the old sources unless the warehouse is on", async () => {
  Reflect.deleteProperty(process.env, "MEZO_ACTIVITY_SOURCE")
  let warehouseCalls = 0
  const value = await withWarehouseFallback(
    CHAIN_ID.mainnet,
    "test",
    async () => {
      warehouseCalls += 1
      return "warehouse"
    },
    async () => "fallback",
  )
  assert.equal(value, "fallback")
  assert.equal(warehouseCalls, 0)
})

test("a failed warehouse read falls back and trips the breaker", async () => {
  process.env.MEZO_ACTIVITY_SOURCE = "warehouse"
  let warehouseCalls = 0
  async function warehouse(): Promise<string> {
    warehouseCalls += 1
    throw new WarehouseUnavailableError("quota exceeded")
  }
  async function fallback(): Promise<string> {
    return "fallback"
  }
  assert.equal(
    await withWarehouseFallback(CHAIN_ID.mainnet, "test", warehouse, fallback),
    "fallback",
  )
  assert.equal(warehouseReadable(CHAIN_ID.mainnet), false)
  // While tripped, the warehouse is not asked at all.
  assert.equal(
    await withWarehouseFallback(CHAIN_ID.mainnet, "test", warehouse, fallback),
    "fallback",
  )
  assert.equal(warehouseCalls, 1)
  resetWarehouseBreaker()
  assert.equal(warehouseReadable(CHAIN_ID.mainnet), true)
})

test("a hung warehouse read times out", async () => {
  process.env.MATCHBOX_WAREHOUSE_URL =
    "postgresql://reader:secret@ep-test-000000.us-east-2.aws.neon.tech/neondb"
  globalThis.fetch = () => new Promise<Response>(() => {})
  const started = Date.now()
  await assert.rejects(
    queryWarehouse({ text: "SELECT 3", params: [] }),
    /timed out/,
  )
  assert.ok(Date.now() - started >= WAREHOUSE_TIMEOUT_MS - 50)
})

test("fetchMezoActivity serves earn-votes alone when the warehouse fails", async () => {
  process.env.MEZO_ACTIVITY_SOURCE = "warehouse"
  Reflect.deleteProperty(process.env, "MATCHBOX_WAREHOUSE_URL")
  const requested: string[] = []
  globalThis.fetch = async (input) => {
    requested.push(String(input))
    return Response.json({ data: { voteEvents: [] } })
  }
  const result = await fetchMezoActivity({ ...BASE })
  assert.deepEqual(result.data, [])
  assert.deepEqual(result.degraded, ["warehouse"])
  assert.equal(result.indexedThrough, undefined)
  assert.ok(requested.length > 0)
  assert.ok(!requested.some((url) => url.includes("matchbox-explorer")))
  assert.equal(warehouseReadable(CHAIN_ID.mainnet), false)
})

test("fetchMezoActivity returns an empty degraded page for non-vote types without the warehouse", async () => {
  Reflect.deleteProperty(process.env, "MEZO_ACTIVITY_SOURCE")
  globalThis.fetch = async () => {
    throw new Error("no source should be read")
  }
  const result = await fetchMezoActivity({
    ...BASE,
    actionTypes: ["LOCK_CREATED"],
  })
  assert.deepEqual(result.data, [])
  assert.equal(result.hasMore, false)
  assert.deepEqual(result.degraded, ["warehouse"])
})

test("fetchMezoActivity has no source on testnet without the warehouse", async () => {
  Reflect.deleteProperty(process.env, "MEZO_ACTIVITY_SOURCE")
  await assert.rejects(
    fetchMezoActivity({ ...BASE, chainId: CHAIN_ID.testnet }),
    WarehouseUnavailableError,
  )
})
