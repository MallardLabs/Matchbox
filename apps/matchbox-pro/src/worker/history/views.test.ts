import { describe, expect, it } from "vitest"
import { earningsSchema, ledgerRowSchema } from "../../features/history/schema"
import type { PairTokenShares, WalletEarningsModel } from "./earnings"
import { EPOCH } from "./math"
import type { EpochClosePrice } from "./pricing"
import { type PriceBook, earningsView, ledgerCsv, ledgerRows } from "./views"

const MEZO = "0x7b7c000000000000000000000000000000000001" as const
const SATS = "0x9d36f8f62347538440a212e9162f534f797542df" as const
const CURRENT = 100n * EPOCH
const WAD = 10n ** 18n

function line(
  token: { token: `0x${string}`; symbol: string },
  amounts: Array<[bigint, bigint, "claimed" | "claimable" | "pending"]>,
): PairTokenShares {
  return {
    tokenId: 7n,
    gauge: "0x449b06b9b6c9b649b610105d1a5e337e1d6d3d1e",
    bribe: "0xb91210b513d7c1515be24c476d807239b56b1b5e",
    token: { ...token, decimals: 18, currentDeposit: 0n },
    shares: amounts.map(([epochStart, amount, status]) => ({
      epochStart,
      amount,
      status,
      balance: 1n,
      supply: 2n,
      deposited: amount * 2n,
    })),
    lastEarn: 0n,
    earned: 0n,
  }
}

function close(epochStart: bigint, mezoUsd: string | null): EpochClosePrice {
  return {
    epochStart,
    epochEnd: epochStart + EPOCH,
    btcUsd: "80000",
    mezoUsd,
    mezoBlock: 1n,
    baseBlock: 1n,
    settled: true,
  }
}

const model: WalletEarningsModel = {
  tokenIds: [7n],
  currentEpoch: CURRENT,
  verified: true,
  lines: [
    line({ token: MEZO, symbol: "MEZO" }, [
      [CURRENT - 3n * EPOCH, 10n * WAD, "claimed"],
      [CURRENT - 2n * EPOCH, 20n * WAD, "claimable"],
      [CURRENT - EPOCH, 30n * WAD, "claimable"],
      [CURRENT, 5n * WAD, "pending"],
    ]),
    line({ token: SATS, symbol: "SATS" }, [
      [CURRENT - EPOCH, 4n * WAD, "claimable"],
    ]),
  ],
}

const book: PriceBook = {
  now: { btcUsd: "80000", mezoUsd: "0.5" },
  closes: new Map([
    [CURRENT - 3n * EPOCH, close(CURRENT - 3n * EPOCH, null)],
    [CURRENT - 2n * EPOCH, close(CURRENT - 2n * EPOCH, "1")],
    [CURRENT - EPOCH, close(CURRENT - EPOCH, "2")],
  ]),
}

describe("earningsView", () => {
  const view = earningsSchema.parse(earningsView(model, book, 4))

  it("returns the window oldest first with zero epochs kept", () => {
    expect(view.epochs.map((epoch) => BigInt(epoch.epochStart))).toEqual([
      CURRENT - 4n * EPOCH,
      CURRENT - 3n * EPOCH,
      CURRENT - 2n * EPOCH,
      CURRENT - EPOCH,
    ])
    expect(view.epochs[0]?.tokens).toEqual([])
    expect(view.epochs[0]?.usdAtEarn).toBe("0.000000")
  })

  it("leaves unpriced lines out of USD and counts them", () => {
    // MEZO had no price at that close: null, never $0.
    expect(view.epochs[1]?.usdAtEarn).toBeNull()
    expect(view.epochs[1]?.unpriced).toBe(1)
    // SATS has no price class; MEZO priced at $2.
    expect(view.epochs[3]?.usdAtEarn).toBe("60.000000")
    expect(view.epochs[3]?.unpriced).toBe(1)
  })

  it("splits lifetime into claimed, claimable and projected", () => {
    expect(view.totals.realized.usdAtEarn).toBe("80.000000")
    expect(view.totals.realized.unpriced).toBe(2)
    expect(view.totals.claimed.tokens[0]?.amount).toBe((10n * WAD).toString())
    expect(view.totals.claimable.tokens.map((token) => token.symbol)).toEqual([
      "MEZO",
      "SATS",
    ])
    expect(view.current.tokens[0]?.amount).toBe((5n * WAD).toString())
    expect(view.current.usdNow).toBe("2.500000")
    expect(view.totals.projected.usdAtEarn).toBeNull()
  })
})

describe("ledger", () => {
  const rows = ledgerRows(model, book)

  it("emits one valid row per non-zero share, newest first", () => {
    expect(rows).toHaveLength(5)
    for (const row of rows) ledgerRowSchema.parse(row)
    expect(rows[0]?.status).toBe("pending")
    expect(rows[0]?.usdAtEarn).toBeNull()
    expect(rows.at(-1)?.status).toBe("claimed")
  })

  it("writes CSV with decimal and wei amounts", () => {
    const csv = ledgerCsv(rows).trim().split("\n")
    expect(csv[0]?.startsWith("epoch_start,epoch_end,date,lock")).toBe(true)
    expect(csv).toHaveLength(6)
    expect(csv[1]).toContain(",MEZO,5,5000000000000000000,,2.500000,pending,")
  })
})
