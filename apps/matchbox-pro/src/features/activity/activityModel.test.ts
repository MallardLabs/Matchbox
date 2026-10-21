import type { ActivityItem } from "@/features/history/useHistory"
import { epochNumberFor } from "@/lib/epoch"
import { describe, expect, it } from "vitest"
import {
  type Names,
  activityCsvRows,
  allocation,
  allocationText,
  eventAmount,
  eventLine,
  eventStale,
  eventTitle,
  filterKinds,
  formatWhen,
  groupEvents,
  permalinkPath,
  powerUsed,
} from "./activityModel"

const E18 = 10n ** 18n
const TX = `0x${"ab".repeat(32)}`
const G1 = "0x00000000000000000000000000000000000000a1"
const G2 = "0x00000000000000000000000000000000000000b2"
const MEZO = "0x7b7c000000000000000000000000000000000001"

function item(overrides: Partial<ActivityItem>): ActivityItem {
  return {
    id: "x",
    kind: "voted",
    actionType: "BOOST_VOTE",
    source: "BOOST_VOTER",
    blockNumber: 100n,
    logIndex: 0,
    txHash: TX,
    txFrom: null,
    timestamp: 1_792_100_000,
    epochStart: 1_792_022_400,
    status: "final",
    actor: null,
    recipient: null,
    tokenId: null,
    gauge: null,
    pool: null,
    rewardContract: null,
    rewardType: null,
    token: null,
    amount: null,
    weight: null,
    totalWeight: null,
    boost: null,
    boostableTokenId: null,
    lock: undefined,
    escrow: "veMEZO",
    symbol: null,
    decimals: null,
    ...overrides,
  }
}

const names: Names = {
  gauge: (address) => (address === G1 ? "Stackbridge" : null),
}

describe("groupEvents", () => {
  it("collapses a multi-gauge vote (and its re-vote reset) into one event", () => {
    const events = groupEvents([
      item({ id: "a", kind: "vote_reset", tokenId: 4821n, gauge: G2 }),
      item({ id: "b", tokenId: 4821n, gauge: G1, weight: 42n * E18 }),
      item({ id: "c", tokenId: 4821n, gauge: G2, weight: 58n * E18 }),
      item({ id: "d", tokenId: 4966n, gauge: G1, weight: E18 }),
    ])
    expect(events).toHaveLength(2)
    expect(events[0]?.kind).toBe("voted")
    expect(events[0]?.items).toHaveLength(3)
    const lines = events[0] ? allocation(events[0], names) : []
    expect(allocationText(lines)).toBe("0x0000…00b2 58% · Stackbridge 42%")
    expect(events[0] ? powerUsed(events[0]) : null).toBe(100n * E18)
    expect(events[0] ? eventLine(events[0], names) : "").toBe(
      "Voted · veMEZO #4821 → 0x0000…00b2 58% · Stackbridge 42%",
    )
  })

  it("keeps rows without a tx hash apart", () => {
    const events = groupEvents([
      item({ id: "p1", kind: "profile_published", txHash: null, gauge: G1 }),
      item({ id: "p2", kind: "profile_published", txHash: null, gauge: G1 }),
    ])
    expect(events).toHaveLength(2)
    expect(events[0] ? eventTitle(events[0], names) : "").toBe(
      "Profile published · Stackbridge",
    )
  })

  it("sums a claim tx's tokens", () => {
    const [event] = groupEvents([
      item({
        id: "c1",
        kind: "claimed",
        actionType: "VOTE_BRIBE_CLAIMED",
        source: "BRIBE_VOTING_REWARD",
        gauge: G1,
        token: MEZO,
        amount: 200n * E18,
        symbol: "MEZO",
        decimals: 18,
      }),
      item({
        id: "c2",
        kind: "claimed",
        actionType: "VOTE_BRIBE_CLAIMED",
        source: "BRIBE_VOTING_REWARD",
        gauge: G1,
        token: MEZO,
        amount: 41_200_000_000_000_000_000n,
        symbol: "MEZO",
        decimals: 18,
      }),
    ])
    if (!event) throw new Error("missing event")
    expect(eventAmount(event)).toBe("241.20 MEZO")
    expect(eventLine(event, names)).toBe("Claimed · bribes · Stackbridge")
  })
})

describe("event labels", () => {
  it("names lock changes with signed deltas", () => {
    const [increased] = groupEvents([
      item({
        kind: "lock_increased",
        actionType: "LOCK_AMOUNT_INCREASED",
        source: "VOTING_ESCROW",
        tokenId: 4821n,
        symbol: "MEZO",
        decimals: 18,
        lock: {
          prevAmount: 10_000n * E18,
          postAmount: 12_000n * E18,
          prevDuration: null,
          postDuration: null,
          prevIsPermanent: null,
          postIsPermanent: null,
          mergeSourceTokenId: null,
          mergeDestTokenId: null,
        },
      }),
    ])
    if (!increased) throw new Error("missing event")
    expect(eventAmount(increased)).toBe("+2,000.00 MEZO")
  })

  it("describes merges and boost refreshes", () => {
    const [merged] = groupEvents([
      item({
        kind: "lock_merged",
        source: "VOTING_ESCROW",
        tokenId: 4821n,
        lock: {
          prevAmount: null,
          postAmount: null,
          prevDuration: null,
          postDuration: null,
          prevIsPermanent: null,
          postIsPermanent: null,
          mergeSourceTokenId: 5108n,
          mergeDestTokenId: 4821n,
        },
      }),
    ])
    if (!merged) throw new Error("missing event")
    expect(eventLine(merged, names)).toBe(
      "Merged locks · #5108 into #4821 · irreversible",
    )
    const [poke] = groupEvents([
      item({ kind: "boost_refreshed", boostableTokenId: 221n }),
    ])
    if (!poke) throw new Error("missing event")
    expect(eventTitle(poke, names)).toBe("Boost refreshed · veBTC #221")
  })

  it("formats times, filters and permalinks", () => {
    expect(formatWhen(Date.UTC(2026, 7, 27, 14, 2) / 1000)).toBe("Aug 27 14:02")
    expect(formatWhen(Date.UTC(2026, 7, 6) / 1000, true)).toBe("Aug 06")
    expect(filterKinds("all")).toBeUndefined()
    expect(filterKinds("claims")).toEqual(["claimed"])
    expect(permalinkPath("0xABC", "0xDEF")).toBe("/activity/0xabc/tx/0xdef")
  })

  it("exports one CSV row per event", () => {
    const rows = activityCsvRows(
      groupEvents([item({ tokenId: 1n, gauge: G1, weight: E18 })]),
      names,
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]?.[5]).toBe("voted")
    // Epoch number last (null before the 3 Sep 2026 launch epoch).
    expect(rows[0]?.at(-1)).toBe(epochNumberFor(BigInt(rows[0]?.[2] ?? 0)))
    expect(rows[0]?.[6]).toBe("Voted · veMEZO #1 → Stackbridge 100%")
  })
})

describe("per-row staleness", () => {
  const frozen = {
    source: "frozen-explorer" as const,
    indexedThroughBlock: 12_075_331n,
    indexedAt: "2026-09-24T21:14:08.000Z",
    headBlock: 12_657_000n,
    lagBlocks: 581_669n,
    lagSeconds: 2_280_000,
    state: "stale" as const,
  }
  const at = (iso: string): number => Date.parse(iso) / 1000

  it("marks rows from the lagging index Stale", () => {
    expect(
      eventStale(
        { blockNumber: 12_000_000n, timestamp: at("2026-09-20T00:00:00Z") },
        frozen,
      ),
    ).toBe(true)
  })

  it("keeps live vote rows newer than the freeze Final", () => {
    // earn-votes rows carry no block; they're judged by time.
    expect(
      eventStale(
        { blockNumber: 0n, timestamp: at("2026-10-20T18:01:00Z") },
        frozen,
      ),
    ).toBe(false)
    expect(
      eventStale(
        { blockNumber: 0n, timestamp: at("2026-09-01T00:00:00Z") },
        frozen,
      ),
    ).toBe(true)
  })

  it("is never stale when the index is fresh", () => {
    expect(
      eventStale(
        { blockNumber: 1n, timestamp: 1 },
        { ...frozen, state: "fresh" },
      ),
    ).toBe(false)
    expect(eventStale({ blockNumber: 1n, timestamp: 1 }, undefined)).toBe(false)
  })
})

describe("unnamed gauges", () => {
  it("say what the address is on protocol rows", () => {
    const killed = groupEvents([
      item({ kind: "protocol", actionType: "GAUGE_KILLED", gauge: G1 }),
    ])[0]
    if (!killed) throw new Error("expected an event")
    expect(eventTitle(killed, { gauge: () => null })).toBe(
      "Gauge killed · gauge 0x0000…00a1",
    )
  })
})
