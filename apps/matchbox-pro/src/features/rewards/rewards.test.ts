import type { LedgerRow, SealedEpochEarnings } from "@/features/history/parse"
import type { ClaimableRow } from "@/hooks/useClaimable"
import { describe, expect, it } from "vitest"
import { atEarnLabel } from "./EpochLedger"
import {
  retryFrom,
  runPhase,
  signingStatus,
  startRun,
  updateStep,
} from "./claimRun"
import {
  buildBoostSources,
  buildSources,
  formatNative,
  formatTokenList,
  signatureNote,
  sourceLabel,
  sourceShortLabel,
  sourceTokens,
} from "./claimSources"
import { csvCell, csvFilename, toCsv } from "./csv"
import {
  EPOCH_SECONDS,
  epochShort,
  epochStartOf,
  epochTitle,
  formatEpochDate,
  formatUsdShort,
  formatUsdTick,
  ledgerCsvRows,
  ledgerSource,
  periodFrom,
  realizedBars,
} from "./ledgerModel"

const MEZO = "0x7b7c000000000000000000000000000000000001"
const XYZ = "0x00000000000000000000000000000000000000aa"
const E18 = 10n ** 18n

function claimable(
  tokenId: bigint,
  bribe: string,
  rewards: Array<{
    token: string
    symbol: string
    earned: bigint
    usdMicro: bigint
    priced?: boolean
  }>,
): ClaimableRow {
  return {
    tokenId,
    bribeAddress: bribe as `0x${string}`,
    gaugeAddress: bribe as `0x${string}`,
    tokens: rewards.map((reward) => reward.token as `0x${string}`),
    rewards: rewards.map((reward) => ({
      tokenAddress: reward.token as `0x${string}`,
      symbol: reward.symbol,
      decimals: 18,
      earned: reward.earned,
      usdMicro: reward.usdMicro,
      priceAvailable: reward.priced ?? true,
    })),
  }
}

describe("buildBoostSources", () => {
  const rows = [
    claimable(4966n, "0x0000000000000000000000000000000000000b01", [
      { token: MEZO, symbol: "MEZO", earned: 100n * E18, usdMicro: 5_000_000n },
    ]),
    claimable(4821n, "0x0000000000000000000000000000000000000b01", [
      { token: MEZO, symbol: "MEZO", earned: 10n * E18, usdMicro: 500_000n },
    ]),
    claimable(4821n, "0x0000000000000000000000000000000000000b02", [
      { token: MEZO, symbol: "MEZO", earned: 20n * E18, usdMicro: 1_000_000n },
      {
        token: XYZ,
        symbol: "XYZ",
        earned: 3n * E18,
        usdMicro: 0n,
        priced: false,
      },
    ]),
  ]
  const sources = buildBoostSources(rows)

  it("groups every bribe of a lock into one signature, sorted by lock", () => {
    expect(sources.map((source) => source.tokenId)).toEqual([4821n, 4966n])
    const first = sources[0]
    expect(first?.rewardContracts).toHaveLength(2)
    expect(first?.rewardTokens).toEqual([[MEZO], [MEZO, XYZ]])
  })

  it("sums priced USD only and counts unpriced tokens", () => {
    const first = sources[0]
    expect(first?.usdMicro).toBe(1_500_000n)
    expect(first?.unpriced).toBe(1)
    expect(first?.tokens.find((token) => token.symbol === "MEZO")?.amount).toBe(
      30n * E18,
    )
  })

  it("merges native totals across sources", () => {
    expect(formatTokenList(sourceTokens(sources))).toBe(
      "130.00 MEZO · 3.00 XYZ",
    )
  })

  it("labels sources for desktop and compact rows", () => {
    const first = sources[0]
    if (!first) throw new Error("missing source")
    expect(sourceLabel(first)).toBe("Boost-gauge bribes · veMEZO #4821")
    expect(sourceShortLabel(first)).toBe("Boost bribes · #4821")
  })
})

describe("buildSources", () => {
  const pool = "0x00000000000000000000000000000000000000a1"
  const sources = buildSources([
    {
      kind: "pool-rewards",
      tokenId: 221n,
      gauge: pool,
      rewardContract: "0x00000000000000000000000000000000000000f1",
      tokens: [
        {
          token: MEZO,
          symbol: "MEZO",
          decimals: 18,
          amount: E18,
          usdMicro: 50_000n,
        },
      ],
    },
    {
      kind: "pool-rewards",
      tokenId: 221n,
      gauge: pool,
      rewardContract: "0x00000000000000000000000000000000000000b1",
      tokens: [
        { token: XYZ, symbol: "XYZ", decimals: 18, amount: 0n, usdMicro: null },
      ],
    },
    {
      kind: "validator-bribes",
      tokenId: 221n,
      gauge: "0x00000000000000000000000000000000000000c1",
      rewardContract: "0x00000000000000000000000000000000000000c2",
      tokens: [
        {
          token: XYZ,
          symbol: "XYZ",
          decimals: 18,
          amount: E18,
          usdMicro: null,
        },
      ],
    },
  ])

  it("makes one veBTC source per voter and lock, skipping empty contracts", () => {
    expect(sources.map((source) => source.key)).toEqual([
      "pool-rewards:221",
      "validator-bribes:221",
    ])
    expect(sources[0]?.rewardContracts).toEqual([
      "0x00000000000000000000000000000000000000f1",
    ])
    expect(sources[0]?.escrow).toBe("veBTC")
    expect(sources[1]?.unpriced).toBe(1)
    expect(sources[1]?.usdMicro).toBe(0n)
  })
})

describe("formatNative", () => {
  it("keeps two decimals at or above one unit", () => {
    expect(formatNative(241_200_000_000_000_000_000n, 18)).toBe("241.20")
    expect(formatNative(12_000n * E18, 18)).toBe("12,000.00")
  })

  it("shows two significant digits below one unit", () => {
    expect(formatNative(12_000_000_000_000_000n, 18)).toBe("0.012")
    expect(formatNative(8_100_000_000_000_000n, 18)).toBe("0.0081")
    expect(formatNative(640_000_000_000_000n, 18)).toBe("0.00064")
    expect(formatNative(500_000_000_000_000_000n, 18)).toBe("0.50")
  })

  it("truncates rather than rounding up", () => {
    expect(formatNative(1_999_999_999_999_999_999n, 18)).toBe("1.99")
  })

  it("handles zero and tiny decimals", () => {
    expect(formatNative(0n, 18)).toBe("0")
    expect(formatNative(1806n, 2)).toBe("18.06")
  })
})

describe("signatureNote", () => {
  it("describes independent signatures and gas", () => {
    expect(signatureNote(3, 640_000_000_000_000n)).toBe(
      "3 independent signatures · not atomic · est. gas 0.00064 BTC",
    )
    expect(signatureNote(1, null)).toBe("1 signature")
    expect(signatureNote(0, null)).toBeNull()
  })
})

describe("claim run", () => {
  it("runs to complete", () => {
    let steps = startRun(["a", "b"])
    expect(runPhase(steps)).toBe("running")
    steps = updateStep(steps, "a", { state: "done" })
    steps = updateStep(steps, "b", { state: "done" })
    expect(runPhase(steps)).toBe("complete")
  })

  it("reports partial and failed runs, and retries from the failure", () => {
    let steps = startRun(["a", "b", "c"])
    steps = updateStep(steps, "a", { state: "done" })
    steps = updateStep(steps, "b", { state: "rejected", error: "no" })
    expect(runPhase(steps)).toBe("partial")
    expect(signingStatus("rejected")).toBe("failed")
    steps = retryFrom(steps, "b")
    expect(steps.map((step) => step.state)).toEqual([
      "done",
      "queued",
      "queued",
    ])
    expect(
      runPhase(
        startRun(["x"]).map((s) => ({ ...s, state: "reverted" as const })),
      ),
    ).toBe("failed")
  })
})

describe("csv", () => {
  it("escapes quotes, commas and newlines", () => {
    expect(csvCell('a "b", c')).toBe('"a ""b"", c"')
    expect(csvCell("line\nbreak")).toBe('"line\nbreak"')
    expect(csvCell(null)).toBe("")
  })

  it("guards spreadsheet formulas but not numbers", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)")
    expect(csvCell("-12.5")).toBe("-12.5")
    expect(csvCell("@x")).toBe("'@x")
  })

  it("joins rows with CRLF", () => {
    expect(toCsv(["a", "b"], [[1, "x"]])).toBe("a,b\r\n1,x")
  })

  it("names the file by address and UTC date", () => {
    expect(
      csvFilename("rewards", "0xABCDEF", new Date("2026-10-21T23:30:00Z")),
    ).toBe("matchbox-rewards-0xabcdef-2026-10-21.csv")
  })
})

function sealed(
  epochStart: number,
  usdAtEarnMicro: bigint | null,
): SealedEpochEarnings {
  return {
    epochStart,
    epochEnd: epochStart + EPOCH_SECONDS,
    status: "sealed",
    tokens: [],
    usdAtEarnMicro,
    usdNowMicro: usdAtEarnMicro,
    unpriced: usdAtEarnMicro === null ? 1 : 0,
  }
}

describe("ledger model", () => {
  const now = 1_792_100_000
  const current = epochStartOf(now)

  it("bounds periods: this epoch only, or eight sealed plus current", () => {
    expect(current % EPOCH_SECONDS).toBe(0)
    expect(periodFrom("epoch", now)).toBe(current)
    expect(periodFrom("last-8", now)).toBe(current - 8 * EPOCH_SECONDS)
    expect(periodFrom("lifetime", now)).toBeUndefined()
  })

  it("formats dates and USD for labels and ticks", () => {
    expect(formatEpochDate(Date.UTC(2026, 7, 6) / 1000)).toBe("Aug 06")
    expect(formatUsdShort(1_049_900_000n)).toBe("$1,050")
    expect(formatUsdShort(4_200_000n)).toBe("$4.20")
    expect(formatUsdTick(1000)).toBe("$1k")
    expect(formatUsdTick(500)).toBe("$500")
  })

  it("charts the last six sealed epochs (as Overview), newest current, then Next", () => {
    const epochs = Array.from({ length: 10 }, (_, index) =>
      sealed(
        current - (10 - index) * EPOCH_SECONDS,
        index === 5 ? null : 100_000_000n,
      ),
    )
    const bars = realizedBars(epochs, 24_000_000n)
    expect(bars).toHaveLength(7)
    expect(bars.map((bar) => bar.tone)).toEqual([
      "past",
      "unavailable",
      "past",
      "past",
      "past",
      "current",
      "projected",
    ])
    expect(bars[1]?.display).toBe("—")
    expect(bars[6]?.label).toBe("Next")
    expect(realizedBars([], null)[0]?.tone).toBe("unavailable")
  })

  it("marks a partly priced epoch as a lower bound", () => {
    const epoch = {
      ...sealed(current - EPOCH_SECONDS, 760_000n),
      unpriced: 1,
    }
    const [bar] = realizedBars([epoch], null)
    expect(bar?.display).toBe("≥$0.76")
    expect(bar?.tone).toBe("current")
  })

  const row: LedgerRow = {
    id: "1",
    epochStart: current - EPOCH_SECONDS,
    epochEnd: current,
    date: new Date(current * 1000).toISOString(),
    tokenId: 4821n,
    escrow: "veMEZO",
    voter: "boost",
    gauge: "0x0000000000000000000000000000000000000b01",
    rewardContract: "0x0000000000000000000000000000000000000c01",
    rewardType: "Bribe",
    token: MEZO,
    symbol: "MEZO",
    decimals: 18,
    amount: 241_200_000_000_000_000_000n,
    balance: 1n,
    supply: 1n,
    deposited: 1n,
    usdAtEarnMicro: 298_110_000n,
    usdNowMicro: null,
    status: "claimable",
    claim: null,
    method: "rpc-checkpoints-v1",
  }

  it("labels ledger sources", () => {
    expect(ledgerSource(row, "Stackbridge")).toBe(
      "Stackbridge · boost bribe · veMEZO #4821",
    )
    expect(
      ledgerSource({ ...row, voter: "pools", rewardType: "Fee" }, null),
    ).toBe("0x0000…0b01 · pool fees · veMEZO #4821")
  })

  it("exports exact amounts and leaves unpriced USD blank", () => {
    const [line] = ledgerCsvRows([row], () => "Stackbridge")
    expect(line?.[13]).toBe("241200000000000000000")
    expect(line?.[14]).toBe("241.2")
    expect(line?.[15]).toBe("298.110000")
    expect(line?.[16]).toBeNull()
  })
})

describe("ledger USD at earn", () => {
  const base = {
    id: "1",
    epochStart: 0,
    epochEnd: 604_800,
    date: "",
    tokenId: 1n,
    escrow: "veMEZO" as const,
    voter: "boost" as const,
    gauge: "0x0000000000000000000000000000000000000b01",
    rewardContract: "0x0000000000000000000000000000000000000c01",
    rewardType: "Bribe" as const,
    token: "0x7b7c000000000000000000000000000000000001",
    symbol: "MEZO",
    decimals: 18,
    amount: 1n,
    balance: 1n,
    supply: 1n,
    deposited: 1n,
    usdAtEarnMicro: null,
    usdNowMicro: 440_000n,
    claim: null,
    method: "rpc-checkpoints-v1" as const,
  }

  it("shows a dash for pending rows, never Unpriced", () => {
    expect(atEarnLabel({ ...base, status: "pending" }, false)).toBe("—")
  })

  it("says Unpriced only once prices have settled", () => {
    expect(atEarnLabel({ ...base, status: "claimable" }, false)).toBe(
      "Unpriced",
    )
    expect(atEarnLabel({ ...base, status: "claimable" }, true)).toBe("—")
    expect(
      atEarnLabel(
        { ...base, status: "claimed", usdAtEarnMicro: 480_000n },
        false,
      ),
    ).toBe("$0.48")
  })
})

describe("epoch names", () => {
  // Classic numbering: Epoch 0 starts Thu 3 Sep 2026 00:00 UTC.
  const launch = 1_788_393_600

  it("numbers epochs from launch and dates the ones before it", () => {
    expect(epochShort(launch)).toBe("0")
    expect(epochShort(launch + 6 * EPOCH_SECONDS)).toBe("6")
    expect(epochShort(launch - EPOCH_SECONDS)).toBe("Aug 27")
    expect(epochShort(launch - 4 * EPOCH_SECONDS)).toBe("Aug 6")
    expect(epochTitle(launch + 6 * EPOCH_SECONDS)).toBe("Epoch 6")
    expect(epochTitle(launch - 2 * EPOCH_SECONDS)).toBe("Epoch Aug 20")
  })

  it("labels chart bars by epoch number", () => {
    const bars = realizedBars(
      [
        sealed(launch - EPOCH_SECONDS, 1_000_000n),
        sealed(launch + 5 * EPOCH_SECONDS, 1_000_000n),
      ],
      null,
    )
    expect(bars.map((bar) => bar.label)).toEqual(["Aug 27", "5", "Next"])
  })

  it("adds the epoch number as the last ledger CSV column", () => {
    const [line] = ledgerCsvRows(
      [
        {
          id: "1",
          epochStart: launch + 2 * EPOCH_SECONDS,
          epochEnd: launch + 3 * EPOCH_SECONDS,
          date: new Date((launch + 3 * EPOCH_SECONDS) * 1000).toISOString(),
          tokenId: 1n,
          escrow: "veMEZO",
          voter: "boost",
          gauge: "0x0000000000000000000000000000000000000b01",
          rewardContract: "0x0000000000000000000000000000000000000c01",
          rewardType: "Bribe",
          token: MEZO,
          symbol: "MEZO",
          decimals: 18,
          amount: 1n,
          balance: 1n,
          supply: 1n,
          deposited: 1n,
          usdAtEarnMicro: null,
          usdNowMicro: null,
          status: "claimable",
          claim: null,
          method: "rpc-checkpoints-v1",
        },
      ],
      () => null,
    )
    expect(line?.at(-1)).toBe(2)
  })
})
