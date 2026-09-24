import { strict as assert } from "node:assert"
import { test } from "node:test"

import { mezoGaugesSnapshotSchema } from "./schema"

const valid = {
  blockNumber: "11686627",
  blockTimestamp: 1_788_787_200,
  epochStart: 1_788_393_600,
  epochIndex: 0,
  totalWeight: "2435249000000000000000000",
  totalVotingPower: "96170000000000000000000000",
  supply: "96170000000000000000000000",
  tokenId: "2849",
  participationBps: "253",
  votingNfts: 11,
  wallets: 6,
  topWallet: {
    owner: "0xabc",
    weight: "1000000000000000000000",
    shareBps: "4107",
  },
  byWallet: [
    {
      owner: "0xabc",
      weight: "1000000000000000000000",
      shareBps: "4107",
      gauges: ["0xg1"],
    },
  ],
  gauges: [
    {
      address: "0xC7e81dd77A4624F0DD14A8bB97Bc721b0CEE6e26",
      name: "USDC/MUSD",
      protocol: "Aerodrome",
      listed: true,
      status: "ok",
      isAlive: true,
      weight: "2000000000000000000000",
      shareBps: "8214",
    },
  ],
  subgraphTotalWeight: "2435249000000000000000000",
  reconciled: true,
  reconciliationDiff: "0",
}

test("mezoGaugesSnapshotSchema round-trips a valid snapshot", () => {
  const parsed = mezoGaugesSnapshotSchema.parse(valid)
  assert.deepEqual(parsed, valid)
  assert.equal(parsed.reconciled, true)
  assert.equal(parsed.reconciliationDiff, "0")
})

test("mezoGaugesSnapshotSchema accepts unreconciled snapshots and null topWallet", () => {
  const parsed = mezoGaugesSnapshotSchema.parse({
    ...valid,
    topWallet: null,
    reconciled: false,
    reconciliationDiff: "-5",
  })
  assert.equal(parsed.reconciled, false)
  assert.equal(parsed.topWallet, null)
})

test("mezoGaugesSnapshotSchema rejects malformed rows", () => {
  assert.throws(() =>
    mezoGaugesSnapshotSchema.parse({ ...valid, votingNfts: "11" }),
  )
  assert.throws(() =>
    mezoGaugesSnapshotSchema.parse({ ...valid, gauges: [{}] }),
  )
})
