import { describe, expect, it } from "vitest"
import {
  type RewardClaim,
  readRewardClaims,
  reconcileRewardClaims,
  rewardClaimError,
} from "./rewardClaims"

const claim: RewardClaim = {
  hash: "0x1111111111111111111111111111111111111111111111111111111111111111",
  tokenId: "42",
  submittedAt: 1_788_000_000_000,
  status: "pending",
}

describe("reward claim recovery", () => {
  it("recovers pending claims after refresh without marking them successful", () => {
    const recovered = readRewardClaims(JSON.stringify([claim]))
    expect(recovered).toEqual([claim])
    expect(reconcileRewardClaims(recovered, [])[0]?.status).toBe("pending")
  })
  it("only confirms the transaction whose receipt succeeded", () => {
    const other: RewardClaim = {
      ...claim,
      hash: "0x2222222222222222222222222222222222222222222222222222222222222222",
    }
    expect(
      reconcileRewardClaims(
        [claim, other],
        [{ hash: claim.hash, status: "confirmed" }],
      ).map((row) => row.status),
    ).toEqual(["confirmed", "pending"])
  })
  it("keeps reverted claims distinct from confirmed claims", () => {
    expect(
      reconcileRewardClaims(
        [claim],
        [{ hash: claim.hash, status: "reverted" }],
      )[0]?.status,
    ).toBe("reverted")
  })
  it("ignores corrupt storage entries", () => {
    expect(readRewardClaims("broken json")).toEqual([])
    expect(
      readRewardClaims(
        JSON.stringify([
          claim,
          { ...claim, hash: "javascript:alert(1)" },
          { ...claim, status: "done" },
        ]),
      ),
    ).toEqual([claim])
  })
  it("distinguishes signature rejection from uncertain submission errors", () => {
    expect(rewardClaimError(new Error("User rejected request"))).toContain(
      "No claim was submitted",
    )
    expect(rewardClaimError(new Error("RPC timeout"))).toContain(
      "Check your wallet activity",
    )
  })
})
