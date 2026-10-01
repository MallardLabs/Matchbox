import { describe, expect, it } from "vitest"
import {
  buildVoteSafeJson,
  calculateSafeBatchChecksum,
  createSafeTransactionBuilderFile,
} from "./safeJson"

const zero = "0x0000000000000000000000000000000000000001" as const

describe("Safe Transaction Builder JSON", () => {
  it("names the file after the lock count and checksums the payload", () => {
    const batch = createSafeTransactionBuilderFile({
      chainId: 31612,
      safeAddress: zero,
      name: "Matchbox vote 2 locks",
      description: "test",
      createdAt: 1,
      calls: [
        { to: zero, value: 0n, data: "0x01" },
        { to: zero, value: 0n, data: "0x02" },
      ],
    })
    expect(batch.version).toBe("1.0")
    expect(batch.transactions).toHaveLength(2)
    expect(batch.meta.name).toBe("Matchbox vote 2 locks")
    expect(batch.meta.checksum).toBe(calculateSafeBatchChecksum(batch))
    expect(batch.transactions[0]?.data).toBe("0x01")
  })

  it("stringifies a vote batch through the shipped helper", () => {
    const json = buildVoteSafeJson({
      chainId: 31612,
      safeAddress: zero,
      calls: [{ to: zero, value: 0n, data: "0xabcdef" }],
    })
    const parsed = JSON.parse(json) as { meta: { name: string } }
    expect(parsed.meta.name).toBe("Matchbox vote 1 locks")
  })
})
