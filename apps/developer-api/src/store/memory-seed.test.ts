import { parseApiKey } from "@repo/platform-contracts/credentials"
import { gaugeProfileSchema } from "@repo/platform-contracts/gauge-profiles"
import { describe, expect, it } from "vitest"
import { defaultMemorySeed, devApiKeys } from "./memory-seed"
import { createMemoryApiStore } from "./memory-store"

describe("memory seed", () => {
  it("contains valid profiles on both networks", () => {
    for (const profile of defaultMemorySeed.profiles) {
      expect(gaugeProfileSchema.safeParse(profile).success).toBe(true)
    }
    const networks = new Set(
      defaultMemorySeed.profiles.map((profile) => profile.network),
    )
    expect([...networks].sort()).toEqual(["mezo", "mezo-testnet"])
  })

  it("uses well-formed dev keys that resolve in the store", async () => {
    const store = await createMemoryApiStore({ pepper: "p".repeat(32) })
    for (const value of Object.values(devApiKeys)) {
      const parsed = parseApiKey(value)
      expect(parsed).not.toBeNull()
      if (parsed !== null) {
        expect(await store.findApiKeyByPrefix(parsed.prefix)).not.toBeNull()
      }
    }
  })
})
