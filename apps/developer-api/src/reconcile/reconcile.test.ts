import { describe, expect, it, vi } from "vitest"
import type { ReconciliationTarget } from "../store/api-store"
import { createMemoryApiStore } from "../store/memory-store"
import { silentLogger } from "../testing"
import { type ChainReader, callsFor, rowFromResults } from "./chain-reader"
import reconcileChainState from "./reconcile"

const boost: ReconciliationTarget = {
  network: "mezo",
  profileType: "boost-gauge",
  gaugeAddress: "0x5a1c4f0e7b9d3e2a8c6f1b0d9e8a7c6b5f4e3d2c",
  vebtcTokenId: "1042",
  operatorAddress: null,
}

const validator: ReconciliationTarget = {
  network: "mezo",
  profileType: "validator-gauge",
  gaugeAddress: "0x2b5e8d1a4c7f0e3b6d9a2c5f8e1b4d7a0c3f6e9b",
  vebtcTokenId: null,
  operatorAddress: "0x3c6f9e2d5a8b1c4f7e0d3a6b9c2f5e8d1a4b7c0e",
}

const meta = { blockNumber: 99n, checkedAt: "2026-09-30T12:00:00.000Z" }
const owner = "0x9F2B1E4D7C0A3B6E5D8C1F4A7B0E3D6C9F2A5B8E"
const zero = "0x0000000000000000000000000000000000000000"

describe("chain reader mapping", () => {
  it("plans four calls for a boost gauge with a token, two otherwise", () => {
    expect(callsFor("mezo", boost)).toHaveLength(4)
    expect(callsFor("mezo", validator)).toHaveLength(2)
    expect(callsFor("mezo", { ...boost, vebtcTokenId: null })).toHaveLength(2)
  })

  it("confirms the token only when the voter maps it back to the gauge", () => {
    const row = rowFromResults(
      "mezo",
      boost,
      [
        { status: "success", result: true },
        { status: "success", result: zero },
        {
          status: "success",
          result: `0x${boost.gaugeAddress.slice(2).toUpperCase()}`,
        },
        { status: "success", result: owner },
      ],
      meta,
    )
    expect(row).toEqual({
      network: "mezo",
      gaugeAddress: boost.gaugeAddress,
      isAlive: true,
      vebtcTokenId: "1042",
      nftOwner: owner.toLowerCase(),
      beneficiary: null,
      poolAddress: null,
      checkedAt: meta.checkedAt,
      blockNumber: "99",
    })
    const mismatch = rowFromResults(
      "mezo",
      boost,
      [
        { status: "failure", error: new Error("reverted") },
        { status: "success", result: owner },
        { status: "success", result: validator.gaugeAddress },
        { status: "success", result: owner },
      ],
      meta,
    )
    expect(mismatch.isAlive).toBeNull()
    expect(mismatch.vebtcTokenId).toBeNull()
    expect(mismatch.nftOwner).toBeNull()
    expect(mismatch.beneficiary).toBe(owner.toLowerCase())
  })
})

describe("reconcileChainState", () => {
  it("batches reads, upserts rows and survives failing batches", async () => {
    const store = await createMemoryApiStore({ pepper: "p".repeat(32) })
    let calls = 0
    const reader: ChainReader = {
      blockNumber: async () => 1234n,
      async readBatch(targets, blockNumber, checkedAt) {
        calls += 1
        if (calls === 1) throw new Error("rpc down")
        return targets.map((target) => ({
          network: target.network,
          gaugeAddress: target.gaugeAddress,
          isAlive: true,
          vebtcTokenId: null,
          nftOwner: null,
          beneficiary: null,
          poolAddress: null,
          checkedAt,
          blockNumber: blockNumber.toString(),
        }))
      },
    }
    const summary = await reconcileChainState({
      store,
      readers: { mezo: reader },
      now: () => new Date("2026-09-30T12:00:00.000Z"),
      logger: silentLogger,
      batchSize: 1,
      concurrency: 2,
    })
    const mezo = summary.networks.find((entry) => entry.network === "mezo")
    expect(mezo).toMatchObject({
      status: "ok",
      targets: 3,
      rows: 2,
      failedBatches: 1,
      blockNumber: "1234",
    })
    const testnet = summary.networks.find(
      (entry) => entry.network === "mezo-testnet",
    )
    expect(testnet?.status).toBe("skipped")
    expect(store.chainStates.size).toBe(2)
  })

  it("never throws when the store fails", async () => {
    const store = await createMemoryApiStore({ pepper: "p".repeat(32) })
    vi.spyOn(store, "listProfilesForReconciliation").mockRejectedValue(
      new Error("db down"),
    )
    const summary = await reconcileChainState({
      store,
      readers: {},
      now: () => new Date(),
      logger: silentLogger,
    })
    expect(summary.status).toBe("failed")
  })
})
