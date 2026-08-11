import { describe, expect, it } from "vitest"
import {
  createWatchedWallet,
  parseStoredWalletState,
  serializeWalletState,
  upsertWatchedWallet,
} from "./selection"

const address = "0xc1430fe45240351e9EbAe396A61Dd4917E75B765"

describe("wallet selection persistence", () => {
  it("normalizes and round-trips a watched wallet", () => {
    const wallet = createWatchedWallet({ address, label: "Treasury" })
    const serialized = serializeWalletState({
      watchedWallets: [wallet],
      activeWatchedAddress: wallet.address,
    })

    expect(parseStoredWalletState(serialized)).toEqual({
      version: 1,
      watchedWallets: [wallet],
      activeWatchedAddress: wallet.address,
    })
  })

  it("deduplicates addresses without changing the selected mode", () => {
    const first = createWatchedWallet({ address, label: "Old label" })
    const updated = createWatchedWallet({ address, label: "Treasury" })

    expect(upsertWatchedWallet([first], updated)).toEqual([updated])
  })

  it("ignores corrupt local state", () => {
    expect(parseStoredWalletState("not-json")).toEqual({
      version: 1,
      watchedWallets: [],
      activeWatchedAddress: null,
    })
  })
})
