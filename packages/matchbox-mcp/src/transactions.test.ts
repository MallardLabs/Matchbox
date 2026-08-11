import { CHAIN_ID, CONTRACTS } from "@repo/shared/contracts"
import { type Hex, decodeFunctionData, getAddress } from "viem"
import { describe, expect, it } from "vitest"
import { gaugeSnapshotSchema } from "./adapters/matchbox-gauges"
import { optimizedBallotSchema } from "./optimizer"
import {
  buildVoteTransactionRequest,
  prepareVoteTransactions,
} from "./transactions"

const account = getAddress("0x9999999999999999999999999999999999999999")
const pool = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
const gauge = "0x1111111111111111111111111111111111111111"
const snapshot = gaugeSnapshotSchema.parse({
  chainId: CHAIN_ID.mainnet,
  blockNumber: "11052919",
  epochStart: "1786320000",
  generatedAt: "2026-08-11T12:00:00.000Z",
  source: {
    name: "Matchbox mainnet indexer + Mezo RPC",
    url: "https://app.matchbox.markets",
    status: "live",
  },
  gauges: [
    {
      id: gauge,
      address: gauge,
      targetAddress: pool,
      name: "BTC / MUSD",
      type: "pool",
      governanceAsset: "veBTC",
      votingBucket: "staking-gauges",
      votingContract: CONTRACTS.mainnet.poolsVoter,
      depositedUsd: "100",
      currentWeight: "1",
      consistencyBps: 10_000,
      fundedEpochs: 8,
      observedEpochs: 8,
      tokenPair: ["BTC", "MUSD"],
      pricingStatus: "complete",
      unpricedTokenCount: 0,
    },
  ],
})
const ballot = optimizedBallotSchema.parse({
  votingContract: CONTRACTS.mainnet.poolsVoter,
  votingBucket: "staking-gauges",
  governanceAsset: "veBTC",
  position: {
    governanceAsset: "veBTC",
    tokenId: "42",
    votingPower: "1000000000000000000",
    votingPowerFormatted: "1",
  },
  allocations: [
    {
      gaugeId: gauge,
      gaugeAddress: gauge,
      gaugeName: "BTC / MUSD",
      gaugeType: "pool",
      tokenPair: ["BTC", "MUSD"],
      pricingStatus: "complete",
      percentage: 100,
      basisPoints: 10_000,
      depositedUsd: "100",
      projectedReturnUsd: "50",
      consistencyBps: 10_000,
    },
  ],
  projectedReturnUsd: "50",
})

describe("vote transaction safety", () => {
  it("keeps watched-wallet ballots read-only", async () => {
    const result = await prepareVoteTransactions({
      address: account,
      walletMode: "watching",
      snapshot,
      ballots: [ballot],
    })

    expect(result.status).toBe("read-only")
    expect(result.transactionRequests).toEqual([])
    expect(result.canSign).toBe(false)
  })

  it("encodes pool targets rather than pool-gauge addresses", () => {
    const voteAbi = [
      {
        inputs: [
          { type: "uint256", name: "_tokenId" },
          { type: "address[]", name: "_poolVote" },
          { type: "uint256[]", name: "_weights" },
        ],
        name: "vote",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function",
      },
    ] as const
    const request = buildVoteTransactionRequest({
      account,
      ballot,
      snapshot,
    })
    const decoded = decodeFunctionData({
      abi: voteAbi,
      data: request.data as Hex,
    })

    expect(decoded.args?.[1]).toEqual([getAddress(pool)])
  })
})
