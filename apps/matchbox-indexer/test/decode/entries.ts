import {
  type Abi,
  type AbiEvent,
  type Address,
  type Hex,
  encodeAbiParameters,
  encodeEventTopics,
} from "viem"
import type { LogWithTx } from "../../src/decode/projection"

// Builds raw logs (with their transaction) as ingest would store them, for
// decoder tests that run projectBlock.

let logIndex = 0

export type EntryOptions = {
  address: Address
  block: bigint
  timestamp: bigint
  from?: Address
  to?: Address
  input?: Hex
}

export function logEntry(
  abi: Abi,
  eventName: string,
  args: Record<string, unknown>,
  options: EntryOptions,
): LogWithTx {
  const event = abi.find(
    (item): item is AbiEvent =>
      item.type === "event" &&
      item.name === eventName &&
      item.inputs.every(
        (input) => input.name === undefined || input.name in args,
      ),
  )
  if (event === undefined) throw new Error(`No event ${eventName}`)
  const topics = encodeEventTopics({ abi: [event], eventName, args })
  const dataInputs = event.inputs.filter((input) => !input.indexed)
  const data = encodeAbiParameters(
    dataInputs,
    dataInputs.map((input) => args[input.name ?? ""]),
  )
  logIndex += 1
  const txHash: Hex = `0x${logIndex.toString(16).padStart(64, "0")}`
  return {
    log: {
      network: "mezo",
      blockNumber: options.block,
      blockHash: `0x${"ab".repeat(32)}`,
      blockTimestamp: options.timestamp,
      txHash,
      txIndex: 0,
      logIndex,
      address: options.address,
      topics: topics.filter((topic): topic is Hex => topic !== null),
      data,
    },
    tx: {
      network: "mezo",
      hash: txHash,
      blockNumber: options.block,
      txIndex: 0,
      from: options.from ?? "0x000000000000000000000000000000000000a11c",
      to: options.to ?? options.address,
      input: options.input ?? "0x12345678",
    },
  }
}
