import { CHAIN_ID } from "@repo/shared/contracts"
import {
  http,
  type Address,
  type PublicClient,
  createPublicClient,
  fallback,
  parseAbi,
} from "viem"
import { chunkArray } from "../../lib/chunk"
import { isolatedRpcUrl } from "../mezoClient"

// Mezo RPC access for history reads. rpc-internal is an archive node and
// answers JSON-RPC batches of up to ~20 calls; larger batches or multicalls
// over ~4KB of calldata fail outright, so reads are packed as many small
// multicalls inside 20-call HTTP batches. Each HTTP batch is one Workers
// subrequest; a cold wallet earnings request makes roughly 10–30.

const MEZO_RPCS = [
  "https://rpc-internal.mezo.org",
  "https://rpc-http.mezo.boar.network",
  "https://mainnet.mezo.public.validationcloud.io",
]
const RPC_BATCH_SIZE = 20
const MULTICALL_BYTES = 4096
/** Calls handed to viem per multicall() (it splits them by MULTICALL_BYTES). */
const CALLS_PER_REQUEST = 1200

export const REWARD_ABI = parseAbi([
  "function numCheckpoints(uint256 tokenId) view returns (uint256)",
  "function checkpoints(uint256 tokenId, uint256 index) view returns (uint256 timestamp, uint256 balanceOf)",
  "function supplyNumCheckpoints() view returns (uint256)",
  "function supplyCheckpoints(uint256 index) view returns (uint256 timestamp, uint256 supply)",
  "function lastEarn(address token, uint256 tokenId) view returns (uint256)",
  "function earned(address token, uint256 tokenId) view returns (uint256)",
  "function tokenRewardsPerEpoch(address token, uint256 epochStart) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
])

export const VOTER_ABI = parseAbi([
  "function lastVoted(uint256 tokenId) view returns (uint256)",
  "function getBoost(uint256 boostableTokenId) view returns (uint256)",
  "function boostableTokenIdToGauge(uint256 boostableTokenId) view returns (address)",
])

export const ESCROW_ABI = parseAbi([
  "function balanceOf(address owner) view returns (uint256)",
  "function ownerToNFTokenIdList(address owner, uint256 index) view returns (uint256)",
])

export const ORACLE_ABI = parseAbi([
  "function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
  "function decimals() view returns (uint8)",
])

/**
 * A fresh client per call: viem's batch queues and in-flight dedupe are
 * per client (and per URL), and Workers cancels a request that waits on I/O
 * started by another request.
 */
export function mezoHistoryClient(): PublicClient {
  return createPublicClient({
    chain: {
      id: CHAIN_ID.mainnet,
      name: "Mezo",
      nativeCurrency: { decimals: 18, name: "Bitcoin", symbol: "BTC" },
      rpcUrls: { default: { http: MEZO_RPCS } },
      contracts: {
        multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" },
      },
    },
    transport: fallback(
      MEZO_RPCS.map((url) =>
        http(isolatedRpcUrl(url), {
          batch: { batchSize: RPC_BATCH_SIZE },
          fetchOptions: { cache: "no-store" },
          retryCount: 1,
          timeout: 20_000,
        }),
      ),
    ),
  })
}

export type ReadCall = {
  address: Address
  abi: readonly unknown[]
  functionName: string
  args?: readonly unknown[]
}

type MulticallRow = { status: "success" | "failure"; result?: unknown }

/**
 * Reads every call through multicall3; a failed call yields `undefined` in
 * its slot. Throws only when the RPC itself is unreachable.
 */
export async function readAll(
  calls: readonly ReadCall[],
  blockNumber?: bigint,
): Promise<unknown[]> {
  if (calls.length === 0) return []
  const rpc = mezoHistoryClient()
  const chunks = await Promise.all(
    chunkArray([...calls], CALLS_PER_REQUEST).map(
      (chunk) =>
        rpc.multicall({
          contracts: chunk as never,
          allowFailure: true,
          batchSize: MULTICALL_BYTES,
          ...(blockNumber === undefined ? {} : { blockNumber }),
        }) as Promise<MulticallRow[]>,
    ),
  )
  return chunks
    .flat()
    .map((row) => (row.status === "success" ? row.result : undefined))
}

export function asBigint(value: unknown): bigint | undefined {
  return typeof value === "bigint" ? value : undefined
}

export function asAddress(value: unknown): Address | undefined {
  return typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value)
    ? (value.toLowerCase() as Address)
    : undefined
}

/** A `(uint256, uint256)` tuple result, e.g. a checkpoint. */
export function asPair(value: unknown): [bigint, bigint] | undefined {
  if (!Array.isArray(value)) return undefined
  const [first, second] = value as unknown[]
  return typeof first === "bigint" && typeof second === "bigint"
    ? [first, second]
    : undefined
}
