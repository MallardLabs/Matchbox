import { strict as assert } from "node:assert"
import { test } from "node:test"
import { type Address, getAddress, parseUnits } from "viem"

import { MEZO_BOOST_POKE_CRON_ADDRESS } from "../mezoActivity/constants"
import { WEEK } from "./epoch"
import { type AcademyParams, type SimInput, simulate } from "./simulate"

import type { MezoActivityItem } from "../../types/mezoActivity"

const REGULAR: Address = getAddress(
  "0x1111111111111111111111111111111111111111",
)
const BLACKLISTED: Address = getAddress(
  "0x2222222222222222222222222222222222222222",
)
const ANOTHER: Address = getAddress(
  "0x3333333333333333333333333333333333333333",
)

// Anchor on a Thursday-aligned epoch boundary in the future so events fall
// cleanly inside the simulator range.
const TO_TS = Math.floor(Math.floor(Date.now() / 1000) / WEEK) * WEEK
const FROM_TS = TO_TS - 4 * WEEK

const PARAMS: AcademyParams = {
  budgetMezoWad: parseUnits("1000000", 18),
  weightNew: 2,
  weightExt: 1,
  weightBoost: 1,
  participationMultiplier: 1,
  mezoUsd: 0.05,
}

function lockEvent(
  actor: Address | undefined,
  timestamp: number,
  overrides: Partial<MezoActivityItem> = {},
): MezoActivityItem {
  return {
    id: `lock-${actor ?? "anon"}-${timestamp}`,
    blockNumber: 1n,
    timestamp,
    actionType: "lockCreated",
    boostContext: "unknown",
    source: "subgraph",
    actorAddress: actor,
    amount: parseUnits("100", 18),
    duration: BigInt(4 * 365 * 86_400),
    tokenId: 1n,
    ...overrides,
  } as MezoActivityItem
}

function voteEvent(
  actor: Address | undefined,
  timestamp: number,
  overrides: Partial<MezoActivityItem> = {},
): MezoActivityItem {
  return {
    id: `vote-${actor ?? "anon"}-${timestamp}`,
    blockNumber: 1n,
    timestamp,
    actionType: "boostVote",
    boostContext: "mezoVeBtcPairBoost",
    source: "subgraph",
    contract: "boostVoter",
    actorAddress: actor,
    weight: parseUnits("50", 18),
    tokenId: 7n,
    gaugeAddress: getAddress("0x4444444444444444444444444444444444444444"),
    ...overrides,
  } as MezoActivityItem
}

function run(input: Partial<SimInput>) {
  const base: SimInput = {
    lockEvents: input.lockEvents ?? [],
    voteEvents: input.voteEvents ?? [],
  }
  const finalInput: SimInput =
    input.blacklist !== undefined
      ? { ...base, blacklist: input.blacklist }
      : base
  return simulate(finalInput, PARAMS, FROM_TS, TO_TS)
}

test("lock track: blacklisted actor produces no row and increments counter", () => {
  const result = run({
    lockEvents: [
      lockEvent(REGULAR, FROM_TS + 100),
      lockEvent(BLACKLISTED, FROM_TS + 200),
    ],
    blacklist: new Set([BLACKLISTED]),
  })
  assert.equal(result.totals.droppedBlacklistEvents, 1)
  assert.equal(result.rows.length, 1)
  assert.equal(result.rows[0]?.actor, REGULAR)
})

test("vote track: blacklisted actor's vote is dropped and never contributes weight", () => {
  const result = run({
    voteEvents: [voteEvent(BLACKLISTED, FROM_TS - 10 * WEEK)],
    blacklist: new Set([BLACKLISTED]),
  })
  assert.equal(result.totals.droppedBlacklistEvents, 1)
  assert.equal(result.rows.length, 0)
  assert.equal(result.totals.activeVoteAggregateWad, 0n)
})

test("mixed: cron + blacklist + regular actor — counters do not double-count", () => {
  const result = run({
    lockEvents: [
      lockEvent(MEZO_BOOST_POKE_CRON_ADDRESS, FROM_TS + 50),
      lockEvent(BLACKLISTED, FROM_TS + 100),
      lockEvent(REGULAR, FROM_TS + 150),
    ],
    blacklist: new Set([BLACKLISTED]),
  })
  assert.equal(result.totals.droppedCronEvents, 1)
  assert.equal(result.totals.droppedBlacklistEvents, 1)
  assert.equal(result.rows.length, 1)
  assert.equal(result.rows[0]?.actor, REGULAR)
})

test("undefined blacklist preserves original behaviour", () => {
  const result = run({
    lockEvents: [
      lockEvent(REGULAR, FROM_TS + 100),
      lockEvent(ANOTHER, FROM_TS + 200),
    ],
  })
  assert.equal(result.totals.droppedBlacklistEvents, 0)
  assert.equal(result.rows.length, 2)
})

test("lowercase event address vs checksummed blacklist entry — still filtered", () => {
  const lower = BLACKLISTED.toLowerCase() as Address
  const result = run({
    lockEvents: [lockEvent(lower, FROM_TS + 100)],
    blacklist: new Set([BLACKLISTED]),
  })
  assert.equal(result.totals.droppedBlacklistEvents, 1)
  assert.equal(result.rows.length, 0)
})
