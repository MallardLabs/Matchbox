import {
  type AbiParameter,
  type Address,
  type Hex,
  encodeAbiParameters,
  encodeEventTopics,
} from "viem"
import { describe, expect, it } from "vitest"
import {
  CALLDATA_SELECTOR_READERS,
  calldataUse,
  storedInput,
} from "../../src/decode/calldata"
import { POKE_SELECTOR } from "../../src/decode/constants"
import { type HandlerBinding, handlerBindings } from "../../src/decode/dispatch"
import { InMemoryStore } from "../../src/decode/store"
import type { RawLog, RawTx } from "../../src/ingest/rpc"

// Runs every handler binding with different calldata and compares what it
// writes. A handler outside CALLDATA_SELECTOR_READERS must ignore input
// entirely; a handler inside it may read the 4-byte selector but nothing
// after it. Either failing means ingest's selector-only input would change
// the projection.

const BINDINGS = handlerBindings("mezo")
const ADDRESS: Address = "0x00000000000000000000000000000000000c0de1"
const OWNER: Address = "0x000000000000000000000000000000000000a11c"
const VE_MEZO: Address = "0xb90fdad3dfd180458d62cc6acedc983d78e20122"
const TOKEN_ID = 7n

function sampleValue(parameter: AbiParameter): unknown {
  const type = parameter.type
  if (type === "address") return "0x0000000000000000000000000000000000000b0b"
  if (type === "bool") return true
  if (type === "string") return "metadata"
  if (type === "bytes32") return `0x${"11".repeat(32)}`
  if (type === "bytes") return "0x1234"
  if (type === "uint8") return 1
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

function sampleTx(input: Hex): RawTx {
  return {
    network: "mezo",
    hash: `0x${"cd".repeat(32)}`,
    blockNumber: 9_000_000n,
    txIndex: 0,
    from: "0x000000000000000000000000000000000000beef",
    to: ADDRESS,
    input,
  }
}

function serialize(value: unknown): string {
  return JSON.stringify(value, (_key, inner) =>
    typeof inner === "bigint" ? inner.toString() : inner,
  )
}

// Everything the handler wrote, given the input it was handed.
function outputFor(binding: HandlerBinding, input: Hex): string {
  const store = new InMemoryStore()
  // Seed what handlers read so every branch is reachable: a lock owner for
  // poke-vote resolution and a reward mapping for bribe/fee incentives.
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
  binding.handler(sampleLog(binding), sampleTx(input), store)
  return serialize({
    activities: [...store.activities.values()],
    locks: [...store.locks.values()],
    votes: [...store.votes.values()],
    mappings: [...store.rewardMappings.values()],
    sources: [...store.dataSources.values()],
  })
}

const TAIL_A = `${"00".repeat(31)}07${"12".repeat(64)}`
const TAIL_B = `${"ff".repeat(96)}`

describe("calldata use", () => {
  it("enumerates every handler the explorer subgraph had", () => {
    // 125 manifest handlers collapse to these unique (source, event) pairs.
    expect(BINDINGS.length).toBeGreaterThanOrEqual(68)
    expect(CALLDATA_SELECTOR_READERS).toHaveLength(9)
  })

  it.each(
    BINDINGS.filter((b) => calldataUse(b.kind, b.topic0) === "none").map(
      (b) => [`${b.name}.${b.eventName}`, b] as const,
    ),
  )("%s ignores calldata", (_name, binding) => {
    const baseline = outputFor(binding, "0x")
    expect(outputFor(binding, "0xdeadbeef")).toBe(baseline)
    expect(outputFor(binding, `${POKE_SELECTOR}${TAIL_A}`)).toBe(baseline)
    expect(outputFor(binding, `0xdeadbeef${TAIL_B}`)).toBe(baseline)
  })

  it.each(
    BINDINGS.filter((b) => calldataUse(b.kind, b.topic0) === "selector").map(
      (b) => [`${b.name}.${b.eventName}`, b] as const,
    ),
  )("%s reads only the selector", (_name, binding) => {
    const selectorOnly = outputFor(binding, POKE_SELECTOR)
    expect(outputFor(binding, `${POKE_SELECTOR}${TAIL_A}`)).toBe(selectorOnly)
    expect(outputFor(binding, `${POKE_SELECTOR}${TAIL_B}`)).toBe(selectorOnly)
    // And it really does read the selector, so the list has no stale entries.
    expect(outputFor(binding, "0xdeadbeef")).not.toBe(selectorOnly)
  })

  it("stores at most the selector", () => {
    expect(storedInput(`${POKE_SELECTOR}${TAIL_A}`)).toBe(POKE_SELECTOR)
    expect(storedInput(POKE_SELECTOR)).toBe(POKE_SELECTOR)
    expect(storedInput("0x")).toBe("0x")
  })
})
