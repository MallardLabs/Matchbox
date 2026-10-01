import type { Address, Hex } from "viem"

// Shared contract between ingest (writes these) and decode (reads these).
// See docs/goldsky-exit.md. Addresses and hashes are lowercase hex.

export type Network = "mezo" | "mezo-testnet"

export type RawLog = {
  network: Network
  blockNumber: bigint
  blockHash: Hex
  blockTimestamp: bigint
  txHash: Hex
  txIndex: number
  logIndex: number
  address: Address
  topics: Hex[]
  data: Hex
}

export type RawTx = {
  network: Network
  hash: Hex
  blockNumber: bigint
  txIndex: number
  from: Address
  to: Address | null
  input: Hex
}

// A contract the indexer fetches logs for. Static entries come from config;
// discovered entries come from GaugeCreated / PoolCreated.
export type ContractKind =
  | "votingEscrow"
  | "boostVoter"
  | "poolsVoter"
  | "thirdPartyVoter"
  | "validatorsVoter"
  | "splitter"
  | "minter"
  | "rebaseDistributor"
  | "merkleDistributor"
  | "musdSavingsRate"
  | "pcv"
  | "poolFactory"
  | "pool"
  | "gauge"
  | "bribeVotingReward"
  | "feeVotingReward"

export type RegisteredContract = {
  network: Network
  address: Address
  kind: ContractKind
  // Subgraph data source or template name, e.g. "VeMEZO", "Gauge".
  template: string
  parent: Address | null
  pool: Address | null
  gauge: Address | null
  createdBlock: bigint
  createdTx: Hex | null
}
