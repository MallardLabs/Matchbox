import { strict as assert } from "node:assert"
import { test } from "node:test"

import {
  aggregateVotes,
  formatBps,
  participationBps,
  shareBps,
} from "./participation"

const E18 = 10n ** 18n

test("participationBps returns 2dp basis points", () => {
  // 2,435,249 / 96,170,000 ≈ 2.53%
  assert.equal(participationBps(2_435_249n * E18, 96_170_000n * E18), 253n)
  // 29,614,449 / 97,396,134 ≈ 30.41% (floor of 3040.97)
  assert.equal(participationBps(29_614_449n * E18, 97_396_134n * E18), 3040n)
})

test("participationBps returns 0n on zero supply", () => {
  assert.equal(participationBps(5n * E18, 0n), 0n)
  assert.equal(participationBps(0n, 0n), 0n)
})

test("shareBps returns 0n on zero total", () => {
  assert.equal(shareBps(10n, 0n), 0n)
  assert.equal(shareBps(1n, 4n), 2500n)
})

test("formatBps renders percent with 2 decimals", () => {
  assert.equal(formatBps(3041n), "30.41%")
  assert.equal(formatBps(253n), "2.53%")
  assert.equal(formatBps(0n), "0.00%")
  assert.equal(formatBps(10_000n), "100.00%")
})

test("aggregateVotes handles multi-gauge NFTs and multi-NFT wallets", () => {
  const votes = [
    // NFT 1 (wallet A) votes on two gauges
    {
      tokenId: 1n,
      owner: "0xAAAA",
      gauge: "0xG1",
      currentWeight: 60n * E18,
    },
    {
      tokenId: 1n,
      owner: "0xAAAA",
      gauge: "0xG2",
      currentWeight: 40n * E18,
    },
    // Wallet A also controls NFT 2
    {
      tokenId: 2n,
      owner: "0xaaaa",
      gauge: "0xG1",
      currentWeight: 100n * E18,
    },
    // NFT 3 (wallet B) with zero weight counts as neither NFT nor wallet
    {
      tokenId: 3n,
      owner: "0xBBBB",
      gauge: "0xG2",
      currentWeight: 0n,
    },
  ]

  const agg = aggregateVotes(votes)

  assert.equal(agg.totalWeight, 200n * E18)
  // NFT 3 has no weight, so only 2 voting NFTs
  assert.equal(agg.votingNfts, 2)
  // Wallet B only ever held zero-weight votes — excluded
  assert.equal(agg.wallets, 1)
  assert.equal(agg.byWallet.length, 1)
  // Zero-weight rows still appear in gaugeWeights
  assert.equal(agg.gaugeWeights.get("0xg2"), 40n * E18)

  const top = agg.byWallet[0]
  assert.ok(top)
  assert.equal(top.owner, "0xaaaa")
  assert.equal(top.weight, 200n * E18)
  assert.equal(top.shareBps, 10_000n)
  assert.deepEqual(top.gauges, ["0xg1", "0xg2"])
  assert.equal(agg.topWalletBps, 10_000n)

  assert.equal(agg.gaugeWeights.get("0xg1"), 160n * E18)
  assert.equal(agg.gaugeWeights.get("0xg2"), 40n * E18)
})

test("aggregateVotes on empty input", () => {
  const agg = aggregateVotes([])
  assert.equal(agg.totalWeight, 0n)
  assert.equal(agg.votingNfts, 0)
  assert.equal(agg.wallets, 0)
  assert.equal(agg.topWalletBps, 0n)
  assert.equal(agg.byWallet.length, 0)
})
