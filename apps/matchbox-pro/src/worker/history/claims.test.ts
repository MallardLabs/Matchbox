import { describe, expect, it } from "vitest"
import type { WireLedgerRow } from "../../features/history/schema"
import { type ClaimRow, linkClaims } from "./claims"

const BRIBE = "0xb91210b513d7c1515be24c476d807239b56b1b5e"
const MEZO = "0x7b7c000000000000000000000000000000000001"

function row(
  epochEnd: bigint,
  tokenId: bigint,
  status: WireLedgerRow["status"],
): WireLedgerRow {
  return {
    id: `${epochEnd}-${tokenId}`,
    epochStart: (epochEnd - 604_800n).toString(),
    epochEnd: epochEnd.toString(),
    date: "",
    tokenId: tokenId.toString(),
    escrow: "veMEZO",
    voter: "boost",
    gauge: "0x449b06b9b6c9b649b610105d1a5e337e1d6d3d1e",
    rewardContract: BRIBE,
    rewardType: "Bribe",
    token: MEZO,
    symbol: "MEZO",
    decimals: 18,
    amount: "1",
    balance: "1",
    supply: "1",
    deposited: "1",
    usdAtEarn: null,
    usdNow: null,
    status,
    claim: null,
    method: "rpc-checkpoints-v1",
  }
}

function claim(
  timestamp: bigint,
  tokenId: bigint | null,
  tx: string,
): ClaimRow {
  return {
    txHash: `0x${tx.repeat(64 / tx.length)}`,
    blockNumber: timestamp / 4n,
    logIndex: 0n,
    timestamp,
    rewardContract: BRIBE,
    token: MEZO,
    tokenId,
  }
}

describe("linkClaims", () => {
  const claims = [
    claim(1_000n, 7n, "a"),
    claim(3_000n, null, "b"),
    claim(5_000n, 7n, "c"),
  ]

  it("links each claimed epoch to the lock's first claim after it closed", () => {
    const [early, middle, late, open] = linkClaims(
      [
        row(900n, 7n, "claimed"),
        row(2_000n, 7n, "claimed"),
        row(4_000n, 8n, "claimed"),
        row(6_000n, 7n, "claimable"),
      ],
      claims,
    )
    expect(early?.claim).toMatchObject({
      txHash: `0x${"a".repeat(64)}`,
      confidence: "exact",
    })
    // The next claim doesn't name a lock: matched by wallet only.
    expect(middle?.claim).toMatchObject({
      txHash: `0x${"b".repeat(64)}`,
      confidence: "wallet",
    })
    // Lock 8's claim can't be lock 7's exact claim; none named it after 4000.
    expect(late?.claim).toBeNull()
    expect(open?.claim).toBeNull()
  })

  it("ignores other reward contracts and tokens", () => {
    const [linked] = linkClaims(
      [row(900n, 7n, "claimed")],
      [
        {
          ...claim(1_000n, 7n, "d"),
          token: "0x7b7c000000000000000000000000000000000000",
        },
      ],
    )
    expect(linked?.claim).toBeNull()
  })
})
