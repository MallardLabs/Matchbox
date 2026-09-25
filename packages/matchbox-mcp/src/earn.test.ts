import { describe, expect, it } from "vitest"
import { prepareEarnDeposit } from "./earn"

describe("Earn preparation safety", () => {
  it("refuses to invent an unregistered MEZO/MUSD zap", async () => {
    const result = await prepareEarnDeposit({
      address: "0x9999999999999999999999999999999999999999",
      walletMode: "connected",
      amount: "50",
      fundingAsset: "MUSD",
      vault: "MEZO / MUSD Earn Vault",
    })

    expect(result.status).toBe("unavailable")
    expect(result.transactionRequests).toEqual([])
    expect(result.simulation.reason).toMatch(/no approved/i)
  })
})
