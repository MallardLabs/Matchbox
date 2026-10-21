import { type Abi, type AbiEvent, type Hex, slice, toEventSelector } from "viem"
import type { ContractKind } from "../ingest/store"
import boostVoterAbi from "./abis/boost-voter"
import nonPoolsVoterAbi from "./abis/non-pools-voter"
import poolsVoterAbi from "./abis/pools-voter"

// Which handlers read transaction calldata, so ingest can store less of it.
//
// Only poke detection reads calldata, and only its 4-byte selector:
// detectPokeMethod for BoostPoked, and resolveVoteActor for Voted and
// Abstained on the four voters. No handler reads beyond the selector, so
// ingest may store `input.slice(0, 10)` for every transaction. Every other
// handler ignores input entirely. test/decode/calldata.test.ts proves both by
// running every binding with altered input.
//
// Every handler does read `tx.from` (txFrom, and the actor for pool and
// factory events), so each handled log still needs its transaction row.

export const SELECTOR_LENGTH = 10 // "0x" plus 4 bytes

export type CalldataUse = "none" | "selector"

type CalldataReader = {
  kind: ContractKind
  eventName: string
  topic0: Hex
}

function readers(
  kind: ContractKind,
  abi: Abi,
  eventNames: string[],
): CalldataReader[] {
  return eventNames.map(function reader(eventName) {
    const event = abi.find(
      (item): item is AbiEvent =>
        item.type === "event" && item.name === eventName,
    )
    if (event === undefined) {
      throw new Error(`${kind} ABI has no ${eventName} event`)
    }
    return { kind, eventName, topic0: toEventSelector(event) }
  })
}

// (kind, topic0) pairs whose handlers read the calldata selector.
export const CALLDATA_SELECTOR_READERS: readonly CalldataReader[] = [
  ...readers("boostVoter", boostVoterAbi, ["Voted", "Abstained", "BoostPoked"]),
  ...readers("poolsVoter", poolsVoterAbi, ["Voted", "Abstained"]),
  ...readers("thirdPartyVoter", nonPoolsVoterAbi, ["Voted", "Abstained"]),
  ...readers("validatorsVoter", nonPoolsVoterAbi, ["Voted", "Abstained"]),
]

const READER_KEYS = new Set(
  CALLDATA_SELECTOR_READERS.map((reader) =>
    `${reader.kind}:${reader.topic0}`.toLowerCase(),
  ),
)

export function calldataUse(kind: ContractKind, topic0: Hex): CalldataUse {
  return READER_KEYS.has(`${kind}:${topic0}`.toLowerCase())
    ? "selector"
    : "none"
}

// What ingest needs to keep of a transaction's input: never more than the
// selector.
export function storedInput(input: Hex): Hex {
  return input.length > SELECTOR_LENGTH ? slice(input, 0, 4) : input
}
