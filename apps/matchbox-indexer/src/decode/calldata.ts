import {
  type Abi,
  type AbiEvent,
  type Address,
  type Hex,
  decodeFunctionData,
  parseAbi,
  slice,
  toEventSelector,
  toFunctionSelector,
} from "viem"
import type { RawTx } from "../ingest/rpc"
import type { ContractKind } from "../ingest/store"
import boostVoterAbi from "./abis/boost-voter"
import bribeVotingRewardAbi from "./abis/bribe-voting-reward"
import feeVotingRewardAbi from "./abis/fee-voting-reward"
import nonPoolsVoterAbi from "./abis/non-pools-voter"
import poolsVoterAbi from "./abis/pools-voter"
import { VOTER_ADDRESSES } from "./constants"

// Which handlers read transaction calldata, so ingest can store less of it.
//
// Poke detection reads only the 4-byte selector: detectPokeMethod for
// BoostPoked, and resolveVoteActor for Voted and Abstained on the four
// voters. Reward claims read the claimed lock's tokenId (claimTokenId), but
// only from a claim call sent straight to a voter. So ingest keeps the full
// input of those claim calls and `input.slice(0, 10)` of every other
// transaction. Every other handler ignores input entirely.
// test/decode/calldata.test.ts proves all three by running every binding
// with altered input.
//
// Every handler does read `tx.from` (txFrom, and the actor for pool and
// factory events), so each handled log still needs its transaction row.

export const SELECTOR_LENGTH = 10 // "0x" plus 4 bytes

export type CalldataUse = "none" | "selector" | "claim"

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

// (kind, topic0) pairs whose handlers read a voter claim call's tokenId.
export const CALLDATA_CLAIM_READERS: readonly CalldataReader[] = [
  ...readers("bribeVotingReward", bribeVotingRewardAbi, ["ClaimRewards"]),
  ...readers("feeVotingReward", feeVotingRewardAbi, ["ClaimRewards"]),
  ...readers("voterBribeReward", bribeVotingRewardAbi, ["ClaimRewards"]),
]

function readerKeys(list: readonly CalldataReader[]): Set<string> {
  return new Set(
    list.map((reader) => `${reader.kind}:${reader.topic0}`.toLowerCase()),
  )
}

const SELECTOR_READER_KEYS = readerKeys(CALLDATA_SELECTOR_READERS)
const CLAIM_READER_KEYS = readerKeys(CALLDATA_CLAIM_READERS)

export function calldataUse(kind: ContractKind, topic0: Hex): CalldataUse {
  const key = `${kind}:${topic0}`.toLowerCase()
  if (SELECTOR_READER_KEYS.has(key)) return "selector"
  if (CLAIM_READER_KEYS.has(key)) return "claim"
  return "none"
}

// The voter claim calls. All three end in the claimed lock's tokenId.
// 0xe494ab8b is PoolsVoter's combined claim; its name is inferred from the
// selector, which is all decoding needs.
export const CLAIM_ABI = parseAbi([
  "function claimBribes(address[] _bribes, address[][] _tokens, uint256 _tokenId)",
  "function claimFees(address[] _fees, address[][] _tokens, uint256 _tokenId)",
  "function claimFeesAndBribes(address[] _rewards, address[][] _tokens, uint256 _tokenId)",
])

export const CLAIM_SELECTORS: readonly Hex[] = CLAIM_ABI.map((item) =>
  toFunctionSelector(item),
)
const CLAIM_SELECTOR_SET: ReadonlySet<string> = new Set(CLAIM_SELECTORS)
const VOTERS: ReadonlySet<Address> = new Set(VOTER_ADDRESSES)

type CalldataTx = Pick<RawTx, "to" | "input">

// A reward claim sent straight to a voter. Claims through a Safe, a smart
// account or another wrapper have a different `to` and name no lock here.
export function isVoterClaim(tx: CalldataTx): boolean {
  return (
    tx.to !== null &&
    VOTERS.has(tx.to) &&
    CLAIM_SELECTOR_SET.has(tx.input.slice(0, SELECTOR_LENGTH).toLowerCase())
  )
}

// The lock a voter claim call claimed for, or null when the transaction is
// not one or its stored input was trimmed to the selector.
export function claimTokenId(tx: CalldataTx): bigint | null {
  if (!isVoterClaim(tx) || tx.input.length <= SELECTOR_LENGTH) return null
  try {
    const { args } = decodeFunctionData({ abi: CLAIM_ABI, data: tx.input })
    return args[2]
  } catch {
    return null
  }
}

// What ingest keeps of a transaction's input: the whole of a voter claim
// call, the selector of anything else.
export function storedInput(tx: CalldataTx): Hex {
  if (isVoterClaim(tx)) return tx.input
  return tx.input.length > SELECTOR_LENGTH ? slice(tx.input, 0, 4) : tx.input
}
