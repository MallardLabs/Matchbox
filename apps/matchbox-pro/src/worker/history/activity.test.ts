import { describe, expect, it } from "vitest"
import { activityItemSchema } from "../../features/history/schema"
import {
  actionTypesForKinds,
  activityKind,
  collapseRevotes,
  compareActivityDesc,
  fromExplorerItem,
  fromWarehouseRow,
  upperSnake,
} from "./activity"

// Rows as app.matchbox.markets/api/activity returned them on 2026-10-21.
const EARN_VOTE = {
  id: "earn-vote:54359116142870529",
  blockNumber: "0",
  timestamp: 1792562464,
  actionType: "boostVote",
  boostContext: "mezoVeBtcPairBoost",
  source: "api",
  txHash: "0xb84023e4693a822355062e512e4b4fb229a7c808ef7eeea32b55058cc80d9ba1",
  actorAddress: "0xb44f710054AABE793A14125646BadFD43791a5c4",
  gaugeAddress: "0x404743ad26e8106A9e63A14411DAF9F87c44d317",
  contract: "boostVoter",
  tokenId: "108",
  weight: "156317231137153868403776",
  totalWeight: "1060757766741671802634825",
}
const EARN_ABSTAIN = {
  ...EARN_VOTE,
  id: "earn-vote:54359116142870528",
  actionType: "boostAbstain",
  weight: "156727095915617261173566",
}
const CLAIM = {
  id: "0x7b74bbcc2cce957d571714d02e22cc33da5fbf8351d0259b75884701d684c9a5-9-VOTE_BRIBE_CLAIMED",
  blockNumber: "12075331",
  timestamp: 1790284448,
  actionType: "voteBribeClaimed",
  boostContext: "matchboxGaugeBoost",
  source: "subgraph",
  txHash: "0x7b74bbcc2cce957d571714d02e22cc33da5fbf8351d0259b75884701d684c9a5",
  txFrom: "0x72882699832f95f140a6022dCb95619ac80F8e2A",
  actorAddress: "0x72882699832f95f140a6022dCb95619ac80F8e2A",
  tokenAddress: "0x7B7c000000000000000000000000000000000001",
  gaugeAddress: "0x8Be20a5fF57E381025aE5E3A121B697269569AaF",
  contract: "bribeVotingReward",
  logIndex: 9,
  amount: "1000",
}

describe("explorer rows", () => {
  it("normalizes an earn-votes vote row", () => {
    const item = fromExplorerItem(EARN_VOTE)
    expect(item && activityItemSchema.parse(item)).toBeTruthy()
    expect(item).toMatchObject({
      kind: "voted",
      actionType: "BOOST_VOTE",
      source: "BOOST_VOTER",
      blockNumber: "0",
      logIndex: null,
      actor: "0xb44f710054aabe793a14125646badfd43791a5c4",
      gauge: "0x404743ad26e8106a9e63a14411daf9f87c44d317",
      tokenId: "108",
      epochStart: "1792022400",
      status: "final",
      escrow: "veMEZO",
      symbol: null,
    })
    expect(item?.lock).toBeUndefined()
  })

  it("normalizes a subgraph claim row", () => {
    const item = fromExplorerItem(CLAIM)
    expect(item).toMatchObject({
      kind: "claimed",
      actionType: "VOTE_BRIBE_CLAIMED",
      source: "BRIBE_VOTING_REWARD",
      logIndex: 9,
      token: "0x7b7c000000000000000000000000000000000001",
      amount: "1000",
      rewardContract: null,
      symbol: "MEZO",
      decimals: 18,
    })
  })

  it("leaves a lock row's escrow open (the explorer omits the contract)", () => {
    const item = fromExplorerItem({
      ...CLAIM,
      id: "lock",
      actionType: "lockCreated",
      contract: "votingEscrow",
      tokenId: "9",
    })
    expect(item).toMatchObject({
      kind: "lock_created",
      escrow: null,
      symbol: null,
    })
  })

  it("drops rows that don't validate instead of guessing", () => {
    expect(fromExplorerItem({ ...CLAIM, blockNumber: "-1" })).toBeNull()
    expect(fromExplorerItem({ id: "x" })).toBeNull()
  })
})

describe("warehouse rows", () => {
  it("maps text columns and lock fields", () => {
    const item = fromWarehouseRow({
      id: "0xabc-1-LOCK_CREATED",
      action_type: "LOCK_CREATED",
      source: "VOTING_ESCROW",
      tx_hash: `0x${"ab".repeat(32)}`,
      tx_from: "0x72882699832F95f140a6022dCb95619ac80F8e2A",
      log_index: "1",
      block_number: "12000000",
      timestamp: "1790000000",
      actor: "0x72882699832f95f140a6022dcb95619ac80f8e2a",
      recipient: null,
      token_id: "42",
      amount: "1000",
      prev_amount: null,
      prev_duration: null,
      prev_is_permanent: null,
      post_amount: "1000",
      post_duration: "126144000",
      post_is_permanent: "false",
      merge_source_token_id: null,
      merge_dest_token_id: null,
      token: null,
      gauge: null,
      pool: null,
      reward_contract: null,
      reward_type: null,
      boostable_token_id: null,
      boost: null,
      weight: null,
      total_weight: null,
      contract_address: "0x3d4b1b884a7a1e59fe8589a3296ec8f8cbb6f279",
    })
    expect(item && activityItemSchema.parse(item)).toBeTruthy()
    expect(item?.kind).toBe("lock_created")
    expect(item?.txFrom).toBe("0x72882699832f95f140a6022dcb95619ac80f8e2a")
    expect(item?.lock?.postIsPermanent).toBe(false)
    expect(item?.lock?.postDuration).toBe("126144000")
    expect(item).toMatchObject({ escrow: "veBTC", symbol: "BTC", decimals: 18 })
  })
})

describe("kinds", () => {
  it("separates ballots by voter", () => {
    expect(activityKind("BOOST_VOTE", "BOOST_VOTER")).toBe("voted")
    expect(activityKind("BOOST_VOTE", "POOLS_VOTER")).toBe("pool_ballot")
    expect(activityKind("BOOST_VOTE", "VALIDATORS_VOTER")).toBe(
      "validator_ballot",
    )
    expect(activityKind("LOCK_PERMANENT_UNLOCKED", "VOTING_ESCROW")).toBe(
      "lock_unlocked",
    )
    expect(activityKind("EPOCH_PROCESSED", "MEZO_MINTER")).toBe("protocol")
  })

  it("expands kinds to upstream action types", () => {
    expect(actionTypesForKinds(["claimed"])).toContain("VOTE_BRIBE_CLAIMED")
    expect(actionTypesForKinds(["voted", "pool_ballot"])).toEqual([
      "BOOST_VOTE",
    ])
    expect(actionTypesForKinds(["lock_merged"])).toEqual(["LOCK_MERGED"])
    expect(actionTypesForKinds(["protocol"])).not.toContain("INCENTIVE_ADDED")
  })

  it("converts explorer camelCase names", () => {
    expect(upperSnake("lockPermanentUnlocked")).toBe("LOCK_PERMANENT_UNLOCKED")
    expect(upperSnake("pcvDistribution")).toBe("PCV_DISTRIBUTION")
  })
})

describe("re-votes", () => {
  it("collapses abstain + vote in one tx into the vote", () => {
    const vote = fromExplorerItem(EARN_VOTE)
    const abstain = fromExplorerItem(EARN_ABSTAIN)
    const reset = fromExplorerItem({
      ...EARN_ABSTAIN,
      id: "earn-vote:1",
      txHash: `0x${"cd".repeat(32)}`,
    })
    if (!vote || !abstain || !reset) throw new Error("fixtures must parse")
    const items = collapseRevotes([vote, abstain, reset])
    expect(items.map((item) => item.kind)).toEqual(["voted", "vote_reset"])
  })

  it("orders newest first by timestamp, block, log index", () => {
    const a = fromExplorerItem(CLAIM)
    const b = fromExplorerItem({ ...CLAIM, id: "b", logIndex: 11 })
    const c = fromExplorerItem(EARN_VOTE)
    if (!a || !b || !c) throw new Error("fixtures must parse")
    expect([a, c, b].sort(compareActivityDesc).map((item) => item.id)).toEqual([
      c.id,
      "b",
      a.id,
    ])
  })
})
