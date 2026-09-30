import { describe, expect, it } from "vitest"
import {
  chainIdForNetwork,
  describeNetwork,
  environmentKindForNetwork,
  isNetworkAllowedForEnvironment,
  networkForChainId,
  networkForEnvironmentKind,
  networkSlugSchema,
} from "./network"

describe("network", () => {
  it("maps environments to Mezo networks both ways", () => {
    expect(networkForEnvironmentKind("test")).toBe("mezo-testnet")
    expect(networkForEnvironmentKind("live")).toBe("mezo")
    expect(environmentKindForNetwork("mezo")).toBe("live")
    expect(environmentKindForNetwork("mezo-testnet")).toBe("test")
  })

  it("maps chain ids", () => {
    expect(chainIdForNetwork("mezo")).toBe(31612)
    expect(chainIdForNetwork("mezo-testnet")).toBe(31611)
    expect(networkForChainId(31612)).toBe("mezo")
    expect(networkForChainId(31611)).toBe("mezo-testnet")
    expect(networkForChainId(1)).toBeNull()
  })

  it("enforces the env/network pairing", () => {
    expect(isNetworkAllowedForEnvironment("test", "mezo-testnet")).toBe(true)
    expect(isNetworkAllowedForEnvironment("test", "mezo")).toBe(false)
    expect(isNetworkAllowedForEnvironment("live", "mezo")).toBe(true)
    expect(isNetworkAllowedForEnvironment("live", "mezo-testnet")).toBe(false)
  })

  it("describes networks", () => {
    expect(describeNetwork("mezo-testnet")).toEqual({
      slug: "mezo-testnet",
      chainId: 31611,
      name: "Mezo Testnet",
      environmentKind: "test",
    })
  })

  it("rejects unknown slugs", () => {
    expect(networkSlugSchema.safeParse("ethereum").success).toBe(false)
  })
})
