import assert from "node:assert/strict"
import test from "node:test"
import { resolveMezoGaugeUnpairEligibility } from "./mezoGaugeUnpair"

const tokenA = 1n
const tokenB = 2n
const tokenC = 3n

test("asks the user to select locks when none are chosen", () => {
  const result = resolveMezoGaugeUnpairEligibility({
    selectedCount: 0,
    isLoading: false,
    isInVotingWindow: true,
    locks: [],
  })
  assert.deepEqual(result.unpairableTokenIds, [])
  assert.match(result.blockedMessage ?? "", /Select veMEZO locks/)
})

test("waits while vote state is loading", () => {
  const result = resolveMezoGaugeUnpairEligibility({
    selectedCount: 1,
    isLoading: true,
    isInVotingWindow: true,
    locks: [
      {
        tokenId: tokenA,
        votedThisEpoch: false,
        usedWeight: 1n,
        hasCatalogAllocations: true,
      },
    ],
  })
  assert.deepEqual(result.unpairableTokenIds, [])
  assert.equal(result.blockedMessage, "Checking unpair eligibility...")
})

test("unpairs prior allocations that have not voted this epoch", () => {
  const result = resolveMezoGaugeUnpairEligibility({
    selectedCount: 1,
    isLoading: false,
    isInVotingWindow: true,
    locks: [
      {
        tokenId: tokenA,
        votedThisEpoch: false,
        usedWeight: 1_000n,
        hasCatalogAllocations: true,
      },
    ],
  })
  assert.deepEqual(result.unpairableTokenIds, [tokenA])
  assert.equal(result.blockedMessage, null)
})

test("treats usedWeight as enough even when catalog votes are missing", () => {
  const result = resolveMezoGaugeUnpairEligibility({
    selectedCount: 1,
    isLoading: false,
    isInVotingWindow: true,
    locks: [
      {
        tokenId: tokenA,
        votedThisEpoch: false,
        usedWeight: 10n,
        hasCatalogAllocations: false,
      },
    ],
  })
  assert.deepEqual(result.unpairableTokenIds, [tokenA])
})

test("treats catalog votes as enough even when usedWeight is zero", () => {
  const result = resolveMezoGaugeUnpairEligibility({
    selectedCount: 1,
    isLoading: false,
    isInVotingWindow: true,
    locks: [
      {
        tokenId: tokenA,
        votedThisEpoch: false,
        usedWeight: 0n,
        hasCatalogAllocations: true,
      },
    ],
  })
  assert.deepEqual(result.unpairableTokenIds, [tokenA])
})

test("blocks unpair after a vote this epoch", () => {
  const result = resolveMezoGaugeUnpairEligibility({
    selectedCount: 1,
    isLoading: false,
    isInVotingWindow: true,
    locks: [
      {
        tokenId: tokenA,
        votedThisEpoch: true,
        usedWeight: 1n,
        hasCatalogAllocations: true,
      },
    ],
  })
  assert.deepEqual(result.unpairableTokenIds, [])
  assert.match(result.blockedMessage ?? "", /already voted this epoch/)
})

test("blocks unpair outside the voting window", () => {
  const result = resolveMezoGaugeUnpairEligibility({
    selectedCount: 1,
    isLoading: false,
    isInVotingWindow: false,
    locks: [
      {
        tokenId: tokenA,
        votedThisEpoch: false,
        usedWeight: 1n,
        hasCatalogAllocations: true,
      },
    ],
  })
  assert.deepEqual(result.unpairableTokenIds, [])
  assert.match(result.blockedMessage ?? "", /voting window/)
})

test("skips locks with no prior allocations", () => {
  const result = resolveMezoGaugeUnpairEligibility({
    selectedCount: 1,
    isLoading: false,
    isInVotingWindow: true,
    locks: [
      {
        tokenId: tokenA,
        votedThisEpoch: false,
        usedWeight: 0n,
        hasCatalogAllocations: false,
      },
    ],
  })
  assert.deepEqual(result.unpairableTokenIds, [])
  assert.match(result.blockedMessage ?? "", /no prior MEZO Gauges allocations/)
})

test("does not unpair while lastVoted is still unknown", () => {
  const result = resolveMezoGaugeUnpairEligibility({
    selectedCount: 1,
    isLoading: false,
    isInVotingWindow: true,
    locks: [
      {
        tokenId: tokenA,
        votedThisEpoch: undefined,
        usedWeight: 1n,
        hasCatalogAllocations: true,
      },
    ],
  })
  assert.deepEqual(result.unpairableTokenIds, [])
  assert.equal(result.blockedMessage, "Checking unpair eligibility...")
})

test("unpairs eligible locks and skips the rest", () => {
  const result = resolveMezoGaugeUnpairEligibility({
    selectedCount: 3,
    isLoading: false,
    isInVotingWindow: true,
    locks: [
      {
        tokenId: tokenA,
        votedThisEpoch: false,
        usedWeight: 5n,
        hasCatalogAllocations: true,
      },
      {
        tokenId: tokenB,
        votedThisEpoch: true,
        usedWeight: 5n,
        hasCatalogAllocations: true,
      },
      {
        tokenId: tokenC,
        votedThisEpoch: false,
        usedWeight: 0n,
        hasCatalogAllocations: false,
      },
    ],
  })
  assert.deepEqual(result.unpairableTokenIds, [tokenA])
  assert.match(result.blockedMessage ?? "", /1 selected lock eligible/)
})
