import {
  type AbiParameter,
  type Address,
  type Hex,
  encodeAbiParameters,
  encodeEventTopics,
  encodeFunctionData,
} from "viem"
import { describe, expect, it } from "vitest"
import {
  CALLDATA_CLAIM_READERS,
  CALLDATA_SELECTOR_READERS,
  CLAIM_ABI,
  calldataUse,
  claimTokenId,
  storedInput,
} from "../../src/decode/calldata"
import { POKE_SELECTOR } from "../../src/decode/constants"
import { type HandlerBinding, handlerBindings } from "../../src/decode/dispatch"
import { InMemoryStore } from "../../src/decode/store"
import type { RawLog, RawTx } from "../../src/ingest/rpc"

// Runs every handler binding with different calldata and compares what it
// writes. A handler outside the reader lists must ignore input entirely; a
// selector reader may read the 4-byte selector but nothing after it; a claim
// reader may read a voter claim call's tokenId and nothing else. Any failure
// means ingest's stored input would change the projection.

const BINDINGS = handlerBindings("mezo")
const ADDRESS: Address = "0x00000000000000000000000000000000000c0de1"
const OWNER: Address = "0x000000000000000000000000000000000000a11c"
const VE_MEZO: Address = "0xb90fdad3dfd180458d62cc6acedc983d78e20122"
const BOOST_VOTER: Address = "0x2ba614a598cffa5a19d683cdca97bac3a49313d1"
const POOLS_VOTER: Address = "0x48233ccc97b87ba93bca212cbee48e3210211f03"
const TOKEN_ID = 7n
const CLAIMED_TOKEN_ID = 99n

const CLAIM_INPUT = encodeFunctionData({
  abi: CLAIM_ABI,
  functionName: "claimBribes",
  args: [[ADDRESS], [[ADDRESS]], CLAIMED_TOKEN_ID],
})

function sampleValue(parameter: AbiParameter): unknown {
  const type = parameter.type
  if (type === "address") return "0x0000000000000000000000000000000000000b0b"
  if (type === "bool") return true
  if (type === "string") return "metadata"
  if (type === "bytes32") return `0x${"11".repeat(32)}`
  if (type === "bytes") return "0x1234"
  if (type === "uint8") return 1
  if (type === "uint16") return 100
  if (type.startsWith("uint") || type.startsWith("int")) return TOKEN_ID
  throw new Error(`No sample value for ${type}`)
}

function sampleLog(binding: HandlerBinding): RawLog {
  const args = Object.fromEntries(
    binding.event.inputs.map((input, index) => [
      input.name ?? `arg${index}`,
      sampleValue(input),
    ]),
  )
  const topics = encodeEventTopics({
    abi: [binding.event],
    eventName: binding.event.name,
    args,
  })
  const dataInputs = binding.event.inputs.filter((input) => !input.indexed)
  return {
    network: "mezo",
    blockNumber: 9_000_000n,
    blockHash: `0x${"ab".repeat(32)}`,
    blockTimestamp: 1_780_000_000n,
    txHash: `0x${"cd".repeat(32)}`,
    txIndex: 0,
    logIndex: 3,
    address: ADDRESS,
    topics: topics.filter((topic): topic is Hex => topic !== null),
    data: encodeAbiParameters(
      dataInputs,
      dataInputs.map((input) => sampleValue(input)),
    ),
  }
}

function sampleTx(input: Hex, to: Address): RawTx {
  return {
    network: "mezo",
    hash: `0x${"cd".repeat(32)}`,
    blockNumber: 9_000_000n,
    txIndex: 0,
    from: "0x000000000000000000000000000000000000beef",
    to,
    input,
  }
}

function serialize(value: unknown): string {
  return JSON.stringify(value, (_key, inner) =>
    typeof inner === "bigint" ? inner.toString() : inner,
  )
}

// Everything the handler wrote, given the input it was handed.
function outputFor(
  binding: HandlerBinding,
  input: Hex,
  to: Address = ADDRESS,
): string {
  const store = new InMemoryStore()
  // Seed what handlers read so every branch is reachable: a lock owner for
  // poke-vote resolution, a reward mapping for bribe/fee incentives, and a
  // voter bribe data source for its claims.
  store.putLock({
    id: `${VE_MEZO}-${TOKEN_ID}`,
    tokenId: TOKEN_ID,
    contractAddress: VE_MEZO,
    owner: OWNER,
    amount: 0n,
    unlockAt: null,
    createdAt: null,
    lastExtendedAt: null,
    withdrawnAt: null,
    isPermanent: false,
    isWithdrawn: false,
    isMerged: false,
    mergedIntoTokenId: null,
    mergedAt: null,
    boost: null,
    activityCount: 0n,
  })
  store.putRewardMapping({
    id: ADDRESS,
    poolAddress: "0x00000000000000000000000000000000000000f1",
    gaugeAddress: "0x00000000000000000000000000000000000000f2",
  })
  store.putDataSource({
    network: "mezo",
    address: ADDRESS,
    template: "VoterBribeReward",
    createdBlock: 0n,
    voterSource: "BOOST_VOTER",
    gauge: "0x00000000000000000000000000000000000000f2",
  })
  binding.handler(sampleLog(binding), sampleTx(input, to), store)
  return serialize({
    activities: [...store.activities.values()],
    locks: [...store.locks.values()],
    votes: [...store.votes.values()],
    mappings: [...store.rewardMappings.values()],
    sources: [...store.dataSources.values()],
    deposits: store.rewardDeposits,
    troves: store.troveUpdates,
  })
}

const TAIL_A = `${"00".repeat(31)}07${"12".repeat(64)}`
const TAIL_B = `${"ff".repeat(96)}`

function bindingsUsing(use: "none" | "selector" | "claim") {
  return BINDINGS.filter((b) => calldataUse(b.kind, b.topic0) === use).map(
    (b) => [`${b.name}.${b.eventName}`, b] as const,
  )
}

describe("calldata use", () => {
  it("enumerates every handler the explorer subgraph had, plus the warehouse's", () => {
    // 125 manifest handlers collapse to 68 unique (source, event) pairs; the
    // voter bribe template and the mUSD trove events add more.
    expect(BINDINGS.length).toBeGreaterThanOrEqual(74)
    expect(CALLDATA_SELECTOR_READERS).toHaveLength(9)
    expect(CALLDATA_CLAIM_READERS).toHaveLength(3)
  })

  it.each(bindingsUsing("none"))("%s ignores calldata", (_name, binding) => {
    const baseline = outputFor(binding, "0x")
    expect(outputFor(binding, "0xdeadbeef")).toBe(baseline)
    expect(outputFor(binding, `${POKE_SELECTOR}${TAIL_A}`)).toBe(baseline)
    expect(outputFor(binding, `0xdeadbeef${TAIL_B}`)).toBe(baseline)
    expect(outputFor(binding, CLAIM_INPUT, BOOST_VOTER)).toBe(baseline)
  })

  it.each(bindingsUsing("selector"))(
    "%s reads only the selector",
    (_name, binding) => {
      const selectorOnly = outputFor(binding, POKE_SELECTOR)
      expect(outputFor(binding, `${POKE_SELECTOR}${TAIL_A}`)).toBe(selectorOnly)
      expect(outputFor(binding, `${POKE_SELECTOR}${TAIL_B}`)).toBe(selectorOnly)
      // And it really does read the selector, so the list has no stale entries.
      expect(outputFor(binding, "0xdeadbeef")).not.toBe(selectorOnly)
    },
  )

  it.each(bindingsUsing("claim"))(
    "%s reads only a voter claim's tokenId",
    (_name, binding) => {
      const baseline = outputFor(binding, "0x")
      // Not sent to a voter, not a claim, or trimmed to the selector.
      expect(outputFor(binding, CLAIM_INPUT)).toBe(baseline)
      expect(outputFor(binding, `${POKE_SELECTOR}${TAIL_A}`, BOOST_VOTER)).toBe(
        baseline,
      )
      expect(
        outputFor(
          binding,
          storedInput({ to: ADDRESS, input: CLAIM_INPUT }),
          BOOST_VOTER,
        ),
      ).toBe(baseline)
      // A voter claim names the lock.
      const claimed = outputFor(binding, CLAIM_INPUT, BOOST_VOTER)
      expect(claimed).not.toBe(baseline)
      expect(claimed).toBe(baseline.replace('"tokenId":null', '"tokenId":"99"'))
    },
  )

  it("stores the selector, or the whole of a voter claim call", () => {
    expect(
      storedInput({ to: ADDRESS, input: `${POKE_SELECTOR}${TAIL_A}` }),
    ).toBe(POKE_SELECTOR)
    expect(
      storedInput({ to: BOOST_VOTER, input: `${POKE_SELECTOR}${TAIL_A}` }),
    ).toBe(POKE_SELECTOR)
    expect(storedInput({ to: ADDRESS, input: POKE_SELECTOR })).toBe(
      POKE_SELECTOR,
    )
    expect(storedInput({ to: null, input: "0x" })).toBe("0x")
    expect(storedInput({ to: ADDRESS, input: CLAIM_INPUT })).toBe(
      CLAIM_INPUT.slice(0, 10),
    )
    expect(storedInput({ to: BOOST_VOTER, input: CLAIM_INPUT })).toBe(
      CLAIM_INPUT,
    )
  })

  it("decodes the lock from all three voter claim calls", () => {
    for (const functionName of [
      "claimBribes",
      "claimFees",
      "claimFeesAndBribes",
    ] as const) {
      const input = encodeFunctionData({
        abi: CLAIM_ABI,
        functionName,
        args: [[ADDRESS], [[ADDRESS]], 1629n],
      })
      expect(claimTokenId({ to: POOLS_VOTER, input })).toBe(1629n)
    }
    // The selectors the claim calls observed on chain (2026-10 sample).
    expect(CLAIM_INPUT.slice(0, 10)).toBe("0x7715ee75")
    expect(
      encodeFunctionData({
        abi: CLAIM_ABI,
        functionName: "claimFeesAndBribes",
        args: [[], [], 1n],
      }).slice(0, 10),
    ).toBe("0xe494ab8b")
    expect(claimTokenId({ to: POOLS_VOTER, input: "0x7715ee75" })).toBeNull()
  })
})
