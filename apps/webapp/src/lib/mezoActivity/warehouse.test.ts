import assert from "node:assert/strict"
import { afterEach, test } from "node:test"
import { mapActivityEventRow } from "@/lib/mezoActivity/activityEvent"
import { buildThirdPartyRewardQuery } from "@/lib/mezoGauges/warehouse"
import {
  WarehouseUnavailableError,
  isWarehouseSource,
  parseIndexedThrough,
  warehouseSql,
} from "@/lib/warehouse"
import { CHAIN_ID } from "@repo/shared/contracts"
import { buildActivityQuery, mapWarehouseRows } from "./warehouse"
import { PARITY_FIXTURES } from "./warehouse.fixtures"

const ENV_KEYS = ["MEZO_ACTIVITY_SOURCE", "MATCHBOX_WAREHOUSE_URL"] as const
const savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]))

afterEach(() => {
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
  assert.match(query.text, /"token_id"::text AS "tokenId"/)
  assert.match(
    query.text,
    /"merge_dest_prev_is_permanent" AS "mergeDestPrevIsPermanent"/,
  )
  assert.match(query.text, /"timestamp"::text AS "timestamp"/)
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
