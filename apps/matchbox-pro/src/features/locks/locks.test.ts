import {
  type ClaimSource,
  buildBoostSources,
} from "@/features/rewards/claimSources"
import type { ClaimableRow } from "@/hooks/useClaimable"
import {
  type Address,
  ContractFunctionExecutionError,
  ContractFunctionRevertedError,
} from "viem"
import { describe, expect, it } from "vitest"
import { claimGroups, sourcesForLock } from "./claims"
import {
  LOCK_ESCROW_ABI,
  escrowErrorMessage,
  withEscrowErrors,
} from "./escrowWrites"
import {
  type LockView,
  VE_MEZO_MAX_LOCK,
  WEEK_SECONDS,
  boostLabel,
  exactLockAmount,
  formatLockAmount,
  formatRemaining,
  formatVotingPower,
  initialVotingPower,
  isExpired,
  isUnvoted,
  lockActions,
  lockStatus,
  mergePlan,
  mergedLock,
  parseTokenInput,
  recipientError,
  resetPlan,
} from "./lockModel"
import {
  applySigningEvent,
  retryFrom,
  signingPhase,
  startSigning,
} from "./signing"

const E18 = 10n ** 18n
const NOW = 1_800_000_000n
const DAY = 86_400n

function lock(overrides: Partial<LockView> = {}): LockView {
  return {
    key: "veMEZO-1",
    kind: "veMEZO",
    id: "1",
    tokenId: 1n,
    amount: 100n * E18,
    votingPower: 50n * E18,
    unboostedVotingPower: null,
    end: NOW + 30n * DAY,
    isPermanent: false,
    expired: false,
    hasActiveVotes: false,
    gauge: null,
    profile: null,
    claimable: null,
    ...overrides,
  }
}

const MEZO = "0x7B7c000000000000000000000000000000000001" as Address
const BTC = "0x7b7C000000000000000000000000000000000000" as Address
const GAUGE_A = "0x00000000000000000000000000000000000000aa" as Address
const GAUGE_B = "0x00000000000000000000000000000000000000bb" as Address

function row(
  tokenId: bigint,
  gauge: Address,
  rewards: Array<{ token: Address; earned: bigint; usd: bigint }>,
): ClaimableRow {
  return {
    tokenId,
    gaugeAddress: gauge,
    bribeAddress: `0x${gauge.slice(4)}ff` as Address,
    tokens: rewards.map((reward) => reward.token),
    rewards: rewards.map((reward) => ({
      tokenAddress: reward.token,
      symbol: reward.token === MEZO ? "MEZO" : "BTC",
      decimals: 18,
      earned: reward.earned,
      usdMicro: reward.usd,
      priceAvailable: reward.usd > 0n,
    })),
  }
}

describe("claimGroups", () => {
  const rows = [
    row(1n, GAUGE_A, [
      { token: MEZO, earned: 10n * E18, usd: 1_000_000n },
      { token: BTC, earned: 1n, usd: 0n },
    ]),
    row(2n, GAUGE_A, [{ token: MEZO, earned: 5n * E18, usd: 500_000n }]),
    row(2n, GAUGE_B, [{ token: MEZO, earned: 40n * E18, usd: 4_000_000n }]),
  ]
  const boost = buildBoostSources(rows)
  const pool: ClaimSource = {
    key: "pool-rewards:7",
    kind: "pool-rewards",
    escrow: "veBTC",
    tokenId: 7n,
    rewardContracts: [GAUGE_B],
    rewardTokens: [[MEZO]],
    gauges: 1,
    tokens: [
      { token: MEZO, symbol: "MEZO", decimals: 18, amount: E18, usdMicro: 90n },
    ],
    usdMicro: 90n,
    unpriced: 0,
  }
  const groups = claimGroups([...boost, pool], rows, (gauge) =>
    gauge === GAUGE_A ? "Stackbridge" : "Acre",
  )

  it("orders groups and only shows groups with sources", () => {
    expect(groups.map((group) => group.label)).toEqual(["veBTC", "Pools"])
    expect(groups[0]?.usdMicro).toBe(5_500_000n)
    expect(groups[0]?.unpriced).toBe(true)
    expect(groups[1]?.usdMicro).toBe(90n)
  })

  it("breaks boost bribes down per gauge and pools per lock", () => {
    expect(groups[0]?.rows.map((item) => item.label)).toEqual([
      "Acre",
      "Stackbridge",
    ])
    expect(
      groups[0]?.rows[1]?.tokens.map((token) => [
        token.symbol,
        token.amount.toString(),
      ]),
    ).toEqual([
      ["MEZO", (15n * E18).toString()],
      ["BTC", "1"],
    ])
    expect(groups[1]?.rows.map((item) => item.label)).toEqual(["veBTC #7"])
  })

  it("picks one lock's sources by escrow and id", () => {
    const all = [...boost, pool]
    expect(
      sourcesForLock(all, { kind: "veMEZO", tokenId: 2n }).map(
        (source) => source.key,
      ),
    ).toEqual(["boost-bribes:2"])
    expect(sourcesForLock(all, { kind: "veMEZO", tokenId: 7n })).toEqual([])
    expect(claimGroups([], [], () => "")).toEqual([])
  })
})

describe("lock formatting", () => {
  it("floors the boost multiplier to two decimals", () => {
    expect(boostLabel(5n * E18, E18)).toBe("5.00×")
    expect(boostLabel(4_005n * E18, 1_000n * E18)).toBe("4.00×")
    expect(boostLabel(5n * E18, null)).toBeNull()
    expect(boostLabel(0n, E18)).toBeNull()
  })

  it("formats remaining time and status", () => {
    expect(formatRemaining(NOW + 4n * DAY, NOW, "long")).toBe("4 days")
    expect(formatRemaining(NOW + DAY - 5n, NOW, "long")).toBe("1 day")
    expect(formatRemaining(NOW + 4n * DAY, NOW, "short")).toBe("4d")
    expect(formatRemaining(NOW + 87n * DAY, NOW, "long")).toBe("2mo 27d")
    expect(formatRemaining(NOW + 1_350n * DAY, NOW, "long")).toBe("3y 8mo")
    expect(formatRemaining(NOW + 730n * DAY, NOW, "short")).toBe("2y")
    expect(lockStatus(lock(), NOW)).toBe("Unlocks in 30 days")
    expect(lockStatus(lock({ isPermanent: true }), NOW)).toBe("Auto max-locked")
    expect(lockStatus(lock({ expired: true }), NOW)).toBe("Expired")
    expect(isExpired({ end: NOW, isPermanent: false }, NOW)).toBe(true)
    expect(isExpired({ end: NOW, isPermanent: true }, NOW)).toBe(false)
  })

  it("formats amounts per escrow", () => {
    expect(formatLockAmount("veBTC", 1_243n * 10n ** 14n)).toBe("0.1243 BTC")
    expect(formatLockAmount("veMEZO", 12_400n * E18)).toBe("12,400.00 MEZO")
    expect(formatLockAmount("veMEZO", 12_400n * E18, "short")).toBe(
      "12,400 MEZO",
    )
    expect(formatVotingPower("veBTC", 6_215n * 10n ** 14n)).toBe("0.6215 veBTC")
  })

  it("never shows a non-empty lock as zero", () => {
    // 0.00005 BTC: four decimals would read "0.0000".
    expect(formatLockAmount("veBTC", 5n * 10n ** 13n)).toBe("0.00005 BTC")
    expect(formatVotingPower("veBTC", 5n * 10n ** 13n)).toBe("0.00005 veBTC")
    expect(formatLockAmount("veBTC", 123_456n * 10n ** 10n)).toBe("0.0012 BTC")
    expect(formatLockAmount("veBTC", 1n)).toBe("<0.00000001 BTC")
    expect(formatLockAmount("veBTC", 0n)).toBe("0.0000 BTC")
    expect(formatLockAmount("veMEZO", 5n * 10n ** 17n, "short")).toBe(
      "0.5 MEZO",
    )
    expect(exactLockAmount("veBTC", 5n * 10n ** 13n)).toBe("0.00005 BTC")
  })
})

describe("lockActions", () => {
  it("lists veBTC actions in the J02 order", () => {
    const actions = lockActions(
      lock({
        kind: "veBTC",
        claimable: { usdMicro: 1n, unpriced: false },
        gauge: GAUGE_A,
      }),
      { isOwner: true },
    )
    expect(actions.map((action) => action.id)).toEqual([
      "claim",
      "refresh-boost",
      "auto-max-lock",
      "manage-profile",
    ])
  })

  it("offers disabling Auto max-lock and blocks it while votes are live", () => {
    const actions = lockActions(
      lock({ isPermanent: true, hasActiveVotes: true }),
      { isOwner: true },
    )
    expect(actions).toEqual([
      {
        id: "disable-auto-max-lock",
        label: "Disable Auto max-lock",
        blocked: "Reset votes first",
      },
    ])
  })

  it("hides profile management from non-owners and offers withdraw when expired", () => {
    expect(
      lockActions(lock({ kind: "veBTC", gauge: GAUGE_A }), { isOwner: false })
        .map((action) => action.id)
        .includes("manage-profile"),
    ).toBe(false)
    expect(
      lockActions(lock({ expired: true }), { isOwner: true }).map(
        (action) => action.id,
      ),
    ).toEqual(["withdraw"])
  })
})

describe("isUnvoted", () => {
  it("counts a veMEZO lock with no live votes", () => {
    expect(isUnvoted(lock({ hasActiveVotes: false }))).toBe(true)
  })

  it("treats votes carried over from an earlier epoch as live", () => {
    // #132 on mainnet: lastVoted is months old, usedWeights > 0 (poked).
    expect(isUnvoted(lock({ hasActiveVotes: true }))).toBe(false)
  })

  it("ignores unread flags, expired or powerless locks and veBTC", () => {
    expect(isUnvoted(lock({ hasActiveVotes: undefined }))).toBe(false)
    expect(isUnvoted(lock({ expired: true }))).toBe(false)
    expect(isUnvoted(lock({ votingPower: 0n }))).toBe(false)
    expect(isUnvoted(lock({ kind: "veBTC", key: "veBTC-1" }))).toBe(false)
  })
})

describe("mergePlan", () => {
  const a = lock({ id: "1", key: "a" })
  const permanent = lock({ id: "2", key: "b", isPermanent: true })
  const expired = lock({ id: "3", key: "c", expired: true })
  const voted = lock({ id: "4", key: "d", hasActiveVotes: true })

  it("merges the chosen lock into the other when allowed", () => {
    expect(mergePlan(a, permanent)).toMatchObject({
      ok: true,
      source: { id: "1" },
      target: { id: "2" },
    })
  })

  it("flips the direction when only the reverse is valid", () => {
    expect(mergePlan(permanent, a)).toMatchObject({
      ok: true,
      source: { id: "1" },
      target: { id: "2" },
    })
    expect(mergePlan(a, expired)).toMatchObject({
      ok: true,
      source: { id: "3" },
      target: { id: "1" },
    })
  })

  it("explains blocked pairs", () => {
    expect(mergePlan(permanent, expired)).toMatchObject({
      ok: true,
      source: { id: "3" },
      target: { id: "2" },
    })
    expect(mergePlan(permanent, voted)).toEqual({
      ok: false,
      reason: "#2 is Auto max-locked",
    })
    expect(mergePlan(voted, permanent)).toEqual({
      ok: false,
      reason: "#4 has live votes",
    })
    expect(mergePlan(a, lock({ kind: "veBTC", id: "9" }))).toEqual({
      ok: false,
      reason: "Different escrow",
    })
  })

  it("adds amounts and keeps the later end", () => {
    const result = mergedLock(a, lock({ id: "5", end: NOW + 90n * DAY }))
    expect(result.amount).toBe(200n * E18)
    expect(result.end).toBe(NOW + 90n * DAY)
    expect(mergedLock(a, permanent).isPermanent).toBe(true)
  })
})

describe("signing steps", () => {
  it("walks a sequence and resumes after a failure", () => {
    let steps = startSigning([
      { id: "a", label: "A" },
      { id: "b", label: "B" },
    ])
    expect(steps.map((step) => step.status)).toEqual(["active", "pending"])
    steps = applySigningEvent(steps, "a", "done")
    steps = applySigningEvent(steps, "b", "signing")
    expect(signingPhase(steps)).toBe("signing")
    steps = applySigningEvent(steps, "b", "failed", "Rejected")
    expect(signingPhase(steps)).toBe("failed")
    expect(steps[1]?.error).toBe("Rejected")
    steps = retryFrom(steps, "b")
    expect(steps.map((step) => step.status)).toEqual(["done", "active"])
    steps = applySigningEvent(steps, "b", "done")
    expect(signingPhase(steps)).toBe("done")
  })
})

describe("new lock inputs", () => {
  it("parses typed amounts to base units", () => {
    expect(parseTokenInput("1,000.5", 18)).toBe(10_005n * 10n ** 17n)
    expect(parseTokenInput("0", 18)).toBeNull()
    expect(parseTokenInput("1e3", 18)).toBeNull()
    expect(parseTokenInput(".", 18)).toBeNull()
    expect(parseTokenInput("", 18)).toBeNull()
  })

  it("estimates starting voting power from the week-rounded end", () => {
    const now = 100n * WEEK_SECONDS
    expect(initialVotingPower(1_000n * E18, VE_MEZO_MAX_LOCK, false, now)).toBe(
      1_000n * E18,
    )
    expect(
      initialVotingPower(1_000n * E18, 52n * WEEK_SECONDS, false, now),
    ).toBe(250n * E18)
    expect(initialVotingPower(1_000n * E18, WEEK_SECONDS, true, now)).toBe(
      1_000n * E18,
    )
  })
})

describe("recipientError", () => {
  const owner = "0x08385BF79f956270Cc849648Cb320C225672FADb" as Address
  it("validates transfer recipients", () => {
    expect(recipientError("", owner)).toBe("Enter an address")
    expect(recipientError("0x1234", owner)).toBe("Not a valid address")
    expect(
      recipientError("0x0000000000000000000000000000000000000000", owner),
    ).toBe("That's the zero address")
    expect(recipientError(owner.toLowerCase(), owner)).toBe(
      "That's this wallet",
    )
    expect(
      recipientError("0x25c745343Fb55da9EB1844C0a205EE0300e0Db45", owner),
    ).toBeNull()
  })
})

describe("escrow errors", () => {
  function reverted(data: `0x${string}`): Error {
    const cause = new ContractFunctionRevertedError({
      abi: LOCK_ESCROW_ABI,
      data,
      functionName: "merge",
    })
    return new ContractFunctionExecutionError(cause, {
      abi: LOCK_ESCROW_ABI,
      functionName: "merge",
      args: [1n, 2n],
    })
  }

  it("names known escrow reverts", () => {
    expect(escrowErrorMessage(reverted("0x7c9a1cf9"))).toBe(
      "This lock has live votes. Reset its votes first.",
    )
    expect(escrowErrorMessage(reverted("0x69a21f2a"))).toBe(
      "Disable Auto max-lock on this lock first.",
    )
    expect(escrowErrorMessage(new Error("boom"))).toBeNull()
  })

  it("rethrows known reverts as readable errors", async () => {
    await expect(
      withEscrowErrors(() => Promise.reject(reverted("0xe433766c")))(),
    ).rejects.toThrow("This wallet doesn't own the lock.")
    const rejection = new Error("User rejected")
    await expect(
      withEscrowErrors(() => Promise.reject(rejection))(),
    ).rejects.toBe(rejection)
  })
})

describe("resetPlan", () => {
  const epochStart = 1_000n
  it("waits for every voter read", () => {
    expect(
      resetPlan(
        [{ voter: "pools", usedWeights: undefined, lastVoted: 0n }],
        epochStart,
      ),
    ).toEqual({ status: "loading" })
    expect(resetPlan([], undefined)).toEqual({ status: "loading" })
  })

  it("resets voters still holding weight from earlier epochs", () => {
    expect(
      resetPlan(
        [
          { voter: "pools", usedWeights: 5n, lastVoted: 900n },
          { voter: "validators", usedWeights: 0n, lastVoted: 0n },
        ],
        epochStart,
      ),
    ).toEqual({ status: "ready", resets: ["pools"], blockedBy: [] })
  })

  it("blocks voters that voted this epoch", () => {
    expect(
      resetPlan(
        [
          { voter: "pools", usedWeights: 5n, lastVoted: 1_000n },
          { voter: "validators", usedWeights: 2n, lastVoted: 10n },
        ],
        epochStart,
      ),
    ).toEqual({ status: "ready", resets: ["validators"], blockedBy: ["pools"] })
  })
})
