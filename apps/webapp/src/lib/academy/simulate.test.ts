import { strict as assert } from "node:assert"
import { test } from "node:test"
import { type Address, getAddress, parseUnits } from "viem"

import { MEZO_BOOST_POKE_CRON_ADDRESS } from "../mezoActivity/constants"
import {
  ACADEMY_BONUS_FROM_TS,
  ACADEMY_SESSION_FROM_TS,
  ACADEMY_SESSION_TO_TS,
  defaultAcademyParams,
} from "./constants"
import { WEEK } from "./epoch"
import {
  type AcademyParams,
  type SimInput,
  pointsWeightsAt,
  simulate,
} from "./simulate"

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
  pointsSegments: [],
  participationMultiplier: 1,
  mezoUsd: 0.05,
  // Default to disabled so the existing tests behave as written.
  rewardFloorMezoWad: 0n,
}

const THIRD: Address = getAddress("0x5555555555555555555555555555555555555555")

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

test("academy defaults cover the eight-epoch session and boost its final two epochs", () => {
  const academyParams = defaultAcademyParams()

  assert.equal(ACADEMY_SESSION_FROM_TS, 1_779_926_400)
  assert.equal(ACADEMY_SESSION_TO_TS, ACADEMY_SESSION_FROM_TS + 8 * WEEK)
  assert.deepEqual(pointsWeightsAt(academyParams, ACADEMY_BONUS_FROM_TS - 1), {
    weightNew: 2,
    weightExt: 1,
    weightBoost: 0.5,
  })
  assert.deepEqual(pointsWeightsAt(academyParams, ACADEMY_BONUS_FROM_TS), {
    weightNew: 6,
    weightExt: 3,
    weightBoost: 0.5,
  })
  assert.deepEqual(pointsWeightsAt(academyParams, ACADEMY_SESSION_TO_TS), {
    weightNew: 2,
    weightExt: 1,
    weightBoost: 0.5,
  })
})

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

test("points segments override base weights only inside their half-open range", () => {
  const params: AcademyParams = {
    ...PARAMS,
    pointsSegments: [
      {
        id: "bonus",
        fromTs: FROM_TS + WEEK,
        toTs: FROM_TS + 2 * WEEK,
        weightNew: 6,
        weightExt: 3,
        weightBoost: 0.5,
      },
    ],
  }

  assert.deepEqual(pointsWeightsAt(params, FROM_TS + WEEK - 1), {
    weightNew: 2,
    weightExt: 1,
    weightBoost: 1,
  })
  assert.deepEqual(pointsWeightsAt(params, FROM_TS + WEEK), {
    weightNew: 6,
    weightExt: 3,
    weightBoost: 0.5,
  })
  assert.deepEqual(pointsWeightsAt(params, FROM_TS + 2 * WEEK), {
    weightNew: 2,
    weightExt: 1,
    weightBoost: 1,
  })
})

test("points segments apply the configured new-lock multiplier per event", () => {
  const params: AcademyParams = {
    ...PARAMS,
    pointsSegments: [
      {
        id: "bonus",
        fromTs: FROM_TS + WEEK,
        toTs: FROM_TS + 2 * WEEK,
        weightNew: 6,
        weightExt: 3,
        weightBoost: 1,
      },
    ],
  }
  const result = simulate(
    {
      lockEvents: [
        lockEvent(REGULAR, FROM_TS + 100, { tokenId: 1n }),
        lockEvent(REGULAR, FROM_TS + WEEK + 100, {
          id: "lock-segment",
          tokenId: 2n,
        }),
      ],
      voteEvents: [],
    },
    params,
    FROM_TS,
    TO_TS,
  )

  assert.equal(result.rows[0]?.lockPointsWad, parseUnits("800", 18))
})

test("later overlapping points segments take precedence", () => {
  const params: AcademyParams = {
    ...PARAMS,
    pointsSegments: [
      {
        id: "outer",
        fromTs: FROM_TS,
        toTs: TO_TS,
        weightNew: 6,
        weightExt: 3,
        weightBoost: 1,
      },
      {
        id: "inner",
        fromTs: FROM_TS + WEEK,
        toTs: FROM_TS + 2 * WEEK,
        weightNew: 4,
        weightExt: 2,
        weightBoost: 0.75,
      },
    ],
  }

  assert.deepEqual(pointsWeightsAt(params, FROM_TS + WEEK), {
    weightNew: 4,
    weightExt: 2,
    weightBoost: 0.75,
  })
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

test("live open epoch credits current vote points without participation bonus", () => {
  const openToTs = TO_TS + 60
  const params: AcademyParams = {
    ...PARAMS,
    participationMultiplier: 2,
  }
  const result = simulate(
    { lockEvents: [], voteEvents: [voteEvent(REGULAR, TO_TS + 30)] },
    params,
    FROM_TS,
    openToTs,
    { includeOpenEpoch: true },
  )

  assert.equal(result.totals.totalEpochs, 5)
  assert.equal(result.rows[0]?.activeEpochs, 1)
  assert.equal(result.rows[0]?.votePointsWad, parseUnits("50", 18))
  assert.equal(result.rows[0]?.participationBonusWad, 0n)
  assert.equal(result.rows[0]?.fullyParticipated, false)
})

test("live open epoch excludes current points from participation bonus base", () => {
  const openToTs = TO_TS + 60
  const params: AcademyParams = {
    ...PARAMS,
    participationMultiplier: 2,
  }
  const result = simulate(
    { lockEvents: [], voteEvents: [voteEvent(REGULAR, FROM_TS + 60)] },
    params,
    FROM_TS,
    openToTs,
    { includeOpenEpoch: true },
  )

  assert.equal(result.totals.totalEpochs, 5)
  assert.equal(result.rows[0]?.activeEpochs, 5)
  assert.equal(result.rows[0]?.votePointsWad, parseUnits("250", 18))
  assert.equal(result.rows[0]?.participationBonusWad, parseUnits("200", 18))
  assert.equal(result.rows[0]?.fullyParticipated, true)
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

test("cron poke abstain+vote pair refreshes weight without dropping the vote", () => {
  // On-chain pattern: cron emits Abstained then Voted in the same tx to
  // refresh decayed vePower. Without gating both halves, the cron abstain
  // would wipe the user's sticky weight and the gated cron vote would
  // no-op — leaving the user with zero credit for the rest of the range.
  // With both halves gated correctly, the cron vote refreshes weight on
  // the existing entry and the user keeps earning.
  const weight1 = parseUnits("100", 18)
  const weight2 = parseUnits("80", 18)
  const result = run({
    voteEvents: [
      voteEvent(REGULAR, FROM_TS + 60, {
        id: "manual-vote",
        logIndex: 1,
        weight: weight1,
      }),
      voteEvent(REGULAR, FROM_TS + 2 * WEEK + 60, {
        id: "cron-abstain",
        actionType: "boostAbstain",
        logIndex: 2,
        txFrom: MEZO_BOOST_POKE_CRON_ADDRESS,
        weight: weight1,
      }),
      voteEvent(REGULAR, FROM_TS + 2 * WEEK + 60, {
        id: "cron-vote",
        logIndex: 3,
        txFrom: MEZO_BOOST_POKE_CRON_ADDRESS,
        weight: weight2,
      }),
    ],
  })

  assert.equal(result.rows.length, 1)
  assert.equal(result.rows[0]?.actor, REGULAR)
  // Snapshots: epoch 0 + epoch 1 happen before the cron poke (weight 100
  // each) — that's 200. Epoch 2 + epoch 3 happen after the refresh
  // (weight 80 each) — that's 160. Total 360.
  assert.equal(result.rows[0]?.votePointsWad, parseUnits("360", 18))
  assert.equal(result.rows[0]?.activeEpochs, 4)
  // Manual vote contributes 1; the cron pair contributes 0.
  assert.equal(result.rows[0]?.boostCount, 1)
})

test("participation bonus rewards a pure voter with no lock activity", () => {
  // A voter who voted in every epoch but never opened/extended a lock
  // should still see a participation bonus. Before the fix, `eligible`
  // only spanned lock+ext points, so a vote-only actor got bonus = 0
  // and the multiplier knob had no effect on their pointsWad / reward.
  const baseline = simulate(
    { lockEvents: [], voteEvents: [voteEvent(REGULAR, FROM_TS + 60)] },
    PARAMS,
    FROM_TS,
    TO_TS,
  )

  const boosted = simulate(
    { lockEvents: [], voteEvents: [voteEvent(REGULAR, FROM_TS + 60)] },
    { ...PARAMS, participationMultiplier: 2 },
    FROM_TS,
    TO_TS,
  )

  assert.equal(baseline.rows[0]?.fullyParticipated, true)
  assert.equal(boosted.rows[0]?.fullyParticipated, true)
  // 4 epochs × 50 = 200 vote points baseline. With a 2× full-epoch
  // multiplier the bonus equals the eligible base, so points should
  // double to 400. The bonus lives in its own bucket so a pure voter
  // with zero lock activity doesn't appear to have phantom lock points.
  assert.equal(baseline.rows[0]?.pointsWad, parseUnits("200", 18))
  assert.equal(boosted.rows[0]?.pointsWad, parseUnits("400", 18))
  assert.equal(boosted.rows[0]?.lockPointsWad, 0n)
  assert.equal(boosted.rows[0]?.votePointsWad, parseUnits("200", 18))
  assert.equal(boosted.rows[0]?.participationBonusWad, parseUnits("200", 18))
  assert.equal(baseline.rows[0]?.participationBonusWad, 0n)
})

test("participation bonus doubles only boost points", () => {
  const oneYear = BigInt(365 * 86_400)
  const fourYears = 4n * oneYear
  const lockEvents = [
    lockEvent(REGULAR, FROM_TS + 30, {
      duration: oneYear,
      prevAmount: 0n,
      prevDuration: 0n,
      postAmount: parseUnits("100", 18),
      postDuration: oneYear,
    }),
    lockEvent(REGULAR, FROM_TS + 45, {
      id: "extension-1",
      actionType: "lockExtended",
      duration: fourYears,
      prevAmount: parseUnits("100", 18),
      prevDuration: oneYear,
      postAmount: parseUnits("100", 18),
      postDuration: fourYears,
    }),
  ]
  const input: SimInput = {
    lockEvents,
    voteEvents: [voteEvent(REGULAR, FROM_TS + 60)],
  }

  const baseline = simulate(input, PARAMS, FROM_TS, TO_TS)
  const boosted = simulate(
    input,
    { ...PARAMS, participationMultiplier: 2 },
    FROM_TS,
    TO_TS,
  )

  assert.equal(baseline.rows[0]?.lockPointsWad, parseUnits("50", 18))
  assert.equal(baseline.rows[0]?.extensionPointsWad, parseUnits("75", 18))
  assert.equal(baseline.rows[0]?.votePointsWad, parseUnits("200", 18))
  assert.equal(baseline.rows[0]?.pointsWad, parseUnits("325", 18))
  assert.equal(baseline.totals.newLockCount, 1)
  assert.equal(baseline.totals.newLockMezoWad, parseUnits("100", 18))
  assert.equal(baseline.totals.newLockVeMezoWad, parseUnits("25", 18))
  assert.equal(baseline.totals.extensionCount, 1)
  assert.equal(baseline.totals.extensionMezoWad, parseUnits("100", 18))
  assert.equal(baseline.totals.extensionVeMezoWad, parseUnits("75", 18))
  assert.equal(
    baseline.totals.voteWeightEpochAggregateWad,
    parseUnits("200", 18),
  )
  assert.equal(boosted.rows[0]?.lockPointsWad, parseUnits("50", 18))
  assert.equal(boosted.rows[0]?.extensionPointsWad, parseUnits("75", 18))
  assert.equal(boosted.rows[0]?.votePointsWad, parseUnits("200", 18))
  assert.equal(boosted.rows[0]?.participationBonusWad, parseUnits("200", 18))
  assert.equal(boosted.rows[0]?.pointsWad, parseUnits("525", 18))
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

test("reward floor: actors below floor are culled and their share redistributes", () => {
  // Three actors all locking 4-year locks. REGULAR and ANOTHER each lock
  // 100 MEZO (200 points each). THIRD locks 1 MEZO (2 points). With a
  // 50 MEZO budget and 20 MEZO floor, THIRD's initial 0.25 MEZO falls
  // below the floor → culled. REGULAR and ANOTHER each end up with 25 MEZO
  // (the whole budget split evenly across the two kept actors).
  const params: AcademyParams = {
    ...PARAMS,
    budgetMezoWad: parseUnits("50", 18),
    rewardFloorMezoWad: parseUnits("20", 18),
  }
  const result = simulate(
    {
      lockEvents: [
        lockEvent(REGULAR, FROM_TS + 100, {
          amount: parseUnits("100", 18),
        }),
        lockEvent(ANOTHER, FROM_TS + 200, {
          amount: parseUnits("100", 18),
          tokenId: 2n,
          id: "lock-another-1",
        }),
        lockEvent(THIRD, FROM_TS + 300, {
          amount: parseUnits("1", 18),
          tokenId: 3n,
          id: "lock-third-1",
        }),
      ],
      voteEvents: [],
    },
    params,
    FROM_TS,
    TO_TS,
  )

  assert.equal(result.rows.length, 3)
  assert.equal(result.totals.culledBelowFloorCount, 1)

  const byActor = new Map(result.rows.map((r) => [r.actor, r]))
  const regular = byActor.get(REGULAR)
  const another = byActor.get(ANOTHER)
  const third = byActor.get(THIRD)

  assert.ok(regular && another && third)
  assert.equal(regular.culledBelowFloor, false)
  assert.equal(another.culledBelowFloor, false)
  assert.equal(third.culledBelowFloor, true)
  assert.equal(third.rewardMezoWad, 0n)
  assert.equal(third.apr, 0)

  // Kept actors split the full 50 MEZO budget evenly.
  assert.equal(regular.rewardMezoWad, parseUnits("25", 18))
  assert.equal(another.rewardMezoWad, parseUnits("25", 18))

  // Sum of all paid rewards equals the budget (modulo the small forfeited
  // remainder absorbed into redistribution rounding).
  const paid = regular.rewardMezoWad + another.rewardMezoWad
  assert.equal(paid, params.budgetMezoWad)
})

test("reward floor: disabled (=0) leaves all rewards untouched", () => {
  const params: AcademyParams = {
    ...PARAMS,
    budgetMezoWad: parseUnits("50", 18),
    rewardFloorMezoWad: 0n,
  }
  const result = simulate(
    {
      lockEvents: [
        lockEvent(REGULAR, FROM_TS + 100, { amount: parseUnits("100", 18) }),
        lockEvent(THIRD, FROM_TS + 200, {
          amount: parseUnits("1", 18),
          tokenId: 3n,
          id: "lock-third-1",
        }),
      ],
      voteEvents: [],
    },
    params,
    FROM_TS,
    TO_TS,
  )
  assert.equal(result.totals.culledBelowFloorCount, 0)
  assert.ok(result.rows.every((r) => !r.culledBelowFloor))
  assert.ok(result.rows.every((r) => r.rewardMezoWad > 0n))
})

test("reward floor: everyone below floor → no rewards distributed", () => {
  // 1 MEZO budget, 20 MEZO floor → both actors' initial rewards are far
  // below the floor. Both culled; no kept actor exists; total payout is 0.
  const params: AcademyParams = {
    ...PARAMS,
    budgetMezoWad: parseUnits("1", 18),
    rewardFloorMezoWad: parseUnits("20", 18),
  }
  const result = simulate(
    {
      lockEvents: [
        lockEvent(REGULAR, FROM_TS + 100),
        lockEvent(ANOTHER, FROM_TS + 200, {
          tokenId: 2n,
          id: "lock-another-1",
        }),
      ],
      voteEvents: [],
    },
    params,
    FROM_TS,
    TO_TS,
  )
  assert.equal(result.totals.culledBelowFloorCount, 2)
  assert.ok(result.rows.every((r) => r.culledBelowFloor))
  assert.ok(result.rows.every((r) => r.rewardMezoWad === 0n))
})
