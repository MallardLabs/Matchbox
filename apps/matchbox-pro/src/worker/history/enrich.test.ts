import { describe, expect, it, vi } from "vitest"

const VE_MEZO = "0xb90fdad3dfd180458d62cc6acedc983d78e20122"
const TX = `0x${"ab".repeat(32)}`

vi.mock("./chain", () => ({
  mezoHistoryClient: () => ({
    getTransactionReceipt: async () => ({
      transactionHash: TX,
      logs: [
        { logIndex: 0, address: "0x0000000000000000000000000000000000000001" },
        { logIndex: 3, address: VE_MEZO },
      ],
    }),
  }),
  readAll: async () => ["SATS", 18n],
  asBigint: (value: unknown) => (typeof value === "bigint" ? value : undefined),
}))
vi.mock("./earnings", () => ({ boostBribes: async () => [] }))

const { fromExplorerItem } = await import("./activity")
const { enrichActivity } = await import("./enrich")

describe("enrichActivity", () => {
  it("reads a lock row's escrow from its receipt log", async () => {
    const lock = fromExplorerItem({
      id: "lock",
      blockNumber: "12000000",
      timestamp: 1790000000,
      actionType: "lockCreated",
      source: "subgraph",
      contract: "votingEscrow",
      txHash: TX,
      logIndex: 3,
      tokenId: "9",
      amount: "5",
    })
    const sats = fromExplorerItem({
      id: "claim",
      blockNumber: "12000000",
      timestamp: 1790000000,
      actionType: "voteBribeClaimed",
      source: "subgraph",
      contract: "bribeVotingReward",
      txHash: TX,
      logIndex: 4,
      tokenAddress: "0x9d36f8f62347538440a212e9162f534f797542df",
      amount: "5",
    })
    if (!lock || !sats) throw new Error("fixtures must parse")
    await enrichActivity([lock, sats])
    expect(lock).toMatchObject({
      escrow: "veMEZO",
      symbol: "MEZO",
      decimals: 18,
    })
    expect(sats).toMatchObject({ escrow: null, symbol: "SATS", decimals: 18 })
  })
})
