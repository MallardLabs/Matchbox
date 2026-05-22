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

test("vote placed mid-epoch counts for that epoch (end-of-epoch snapshot)", () => {
  // A single vote placed inside the LAST epoch of the range should still
  // credit that epoch — snapshot happens at epoch end, after this event has
  // been applied to activeVotes.
  const lastEpochStart = TO_TS - WEEK
  const result = run({
    voteEvents: [voteEvent(REGULAR, lastEpochStart + 60, { logIndex: 1 })],
  })
  assert.equal(result.rows.length, 1)
  assert.equal(result.rows[0]?.actor, REGULAR)
  assert.equal(result.rows[0]?.activeEpochs, 1)
  assert.equal(result.rows[0]?.boostCount, 1)
  assert.equal(result.rows[0]?.votePointsWad, parseUnits("50", 18))
})

test("vote then abstain in same epoch nets to zero for that epoch", () => {
  // Boost then abstain inside epoch 0; epochs 1+ never see active weight.
  const t0 = FROM_TS + 60
  const gauge = getAddress("0x6666666666666666666666666666666666666666")
  const result = run({
    voteEvents: [
      voteEvent(REGULAR, t0, {
        id: "v-1",
        logIndex: 1,
        gaugeAddress: gauge,
      }),
      voteEvent(REGULAR, t0 + 30, {
        id: "a-1",
        actionType: "boostAbstain",
        logIndex: 2,
        gaugeAddress: gauge,
      }),
    ],
  })
  assert.equal(result.rows.length, 0)
  assert.equal(result.totals.activeVoteAggregateWad, 0n)
})

test("vote replay: same-timestamp abstain then vote uses log order", () => {
  const timestamp = FROM_TS + 100
  const gauge = getAddress("0x5555555555555555555555555555555555555555")
  const result = run({
    voteEvents: [
      voteEvent(REGULAR, timestamp, {
        id: "vote-log-3",
        blockNumber: 123n,
        logIndex: 3,
        gaugeAddress: gauge,
        weight: parseUnits("70", 18),
      }),
      voteEvent(REGULAR, timestamp, {
        id: "abstain-log-1",
        actionType: "boostAbstain",
        blockNumber: 123n,
        logIndex: 1,
        gaugeAddress: gauge,
        weight: parseUnits("50", 18),
      }),
    ],
  })

  // End-of-epoch semantics: the vote at FROM_TS + 100 is active by the end of
  // epoch 0, so all 4 epochs credit it (4 × 70 = 280).
  assert.equal(result.rows.length, 1)
  assert.equal(result.rows[0]?.actor, REGULAR)
  assert.equal(result.rows[0]?.activeEpochs, 4)
  assert.equal(result.rows[0]?.votePointsWad, parseUnits("280", 18))
  assert.equal(result.totals.activeVoteAggregateWad, parseUnits("70", 18))
})

// Helper for LOCK_TRANSFERRED events. The simulator routes these through
// the voteEvents stream (the subgraph emits them from VotingEscrow Transfer
// logs). `actorAddress` is the buyer (Transfer.to), `recipient` is the
// seller (Transfer.from).
function transferEvent(
  buyer: Address,
  seller: Address,
  timestamp: number,
  tokenId: bigint,
  overrides: Partial<MezoActivityItem> = {},
): MezoActivityItem {
  return {
    id: `transfer-${tokenId}-${timestamp}`,
    blockNumber: 1n,
    timestamp,
    actionType: "lockTransferred",
    boostContext: "unknown",
    source: "subgraph",
    contract: "votingEscrow",
    actorAddress: buyer,
    recipient: seller,
    tokenId,
    ...overrides,
  } as MezoActivityItem
}

test("transfer drains sticky vote at next epoch — seller earns one last epoch only", () => {
  // Alice votes BEFORE the range (sticky weight 50). Without a transfer
  // she'd earn 4 × 50 = 200 across the 4-epoch window. She sells the NFT
  // mid epoch 1; she should still earn epoch 0 + epoch 1 (100 total),
  // nothing after, and the buyer earns 0 because they never re-voted.
  const result = run({
    voteEvents: [
      voteEvent(REGULAR, FROM_TS - WEEK, {
        id: "alice-vote",
        logIndex: 1,
      }),
      transferEvent(ANOTHER, REGULAR, FROM_TS + WEEK + 60, 7n, {
        logIndex: 2,
      }),
    ],
  })

  assert.equal(result.rows.length, 1)
  assert.equal(result.rows[0]?.actor, REGULAR)
  assert.equal(result.rows[0]?.activeEpochs, 2)
  assert.equal(result.rows[0]?.votePointsWad, parseUnits("100", 18))
  assert.equal(result.rows[0]?.boostCount, 0)
  assert.equal(result.totals.activeVoteAggregateWad, 0n)
})

test("cron poke after transfer does not resurrect the vote", () => {
  // Same as above, plus a cron-driven Voted event mid epoch 2 (txFrom=cron).
  // The poke gate must skip it, so the result is identical to the
  // transfer-drain-only case.
  const result = run({
    voteEvents: [
      voteEvent(REGULAR, FROM_TS - WEEK, {
        id: "alice-vote",
        logIndex: 1,
      }),
      transferEvent(ANOTHER, REGULAR, FROM_TS + WEEK + 60, 7n, {
        logIndex: 2,
      }),
      voteEvent(ANOTHER, FROM_TS + 2 * WEEK + 60, {
        id: "cron-poke",
        logIndex: 3,
        txFrom: MEZO_BOOST_POKE_CRON_ADDRESS,
      }),
    ],
  })

  assert.equal(result.rows.length, 1)
  assert.equal(result.rows[0]?.actor, REGULAR)
  assert.equal(result.rows[0]?.votePointsWad, parseUnits("100", 18))
  assert.equal(result.rows[0]?.activeEpochs, 2)
  assert.equal(result.rows[0]?.boostCount, 0)
})

test("buyer manually re-voting after transfer earns from re-vote epoch onwards", () => {
  // Alice pre-range vote (50) → transfer mid epoch 1 → Bob manually
  // re-votes (weight 80) mid epoch 2. Expected:
  //   • Alice: epoch 0 + epoch 1 credit = 100, then drained.
  //   • Bob: epoch 2 + epoch 3 credit = 160, boostCount = 1.
  const result = run({
    voteEvents: [
      voteEvent(REGULAR, FROM_TS - WEEK, {
        id: "alice-vote",
        logIndex: 1,
      }),
      transferEvent(ANOTHER, REGULAR, FROM_TS + WEEK + 60, 7n, {
        logIndex: 2,
      }),
      voteEvent(ANOTHER, FROM_TS + 2 * WEEK + 60, {
        id: "bob-revote",
        logIndex: 3,
        weight: parseUnits("80", 18),
      }),
    ],
  })

  assert.equal(result.rows.length, 2)
  const alice = result.rows.find((r) => r.actor === REGULAR)
  const bob = result.rows.find((r) => r.actor === ANOTHER)
  assert.ok(alice)
  assert.ok(bob)
  assert.equal(alice?.votePointsWad, parseUnits("100", 18))
  assert.equal(alice?.activeEpochs, 2)
  assert.equal(alice?.boostCount, 0)
  assert.equal(bob?.votePointsWad, parseUnits("160", 18))
  assert.equal(bob?.activeEpochs, 2)
  assert.equal(bob?.boostCount, 1)
})

test("cron poke without transfer leaves sticky vote intact and does not bump boostCount", () => {
  // Alice votes mid-range (so a poke would have a different timestamp than
  // her manual vote). Verify the cron poke is a no-op for both state and
  // boostCount, and Alice's sticky vote continues to credit her each epoch.
  const result = run({
    voteEvents: [
      voteEvent(REGULAR, FROM_TS + 60, {
        id: "alice-manual",
        logIndex: 1,
      }),
      voteEvent(REGULAR, FROM_TS + 2 * WEEK + 60, {
        id: "cron-poke",
        logIndex: 2,
        txFrom: MEZO_BOOST_POKE_CRON_ADDRESS,
      }),
    ],
  })

  assert.equal(result.rows.length, 1)
  assert.equal(result.rows[0]?.actor, REGULAR)
  // Alice's manual vote at FROM_TS+60 is active through end of every
  // remaining epoch — credits all 4 epochs.
  assert.equal(result.rows[0]?.activeEpochs, 4)
  assert.equal(result.rows[0]?.votePointsWad, parseUnits("200", 18))
  // Only the manual vote counts toward boostCount; the poke is excluded.
  assert.equal(result.rows[0]?.boostCount, 1)
})
