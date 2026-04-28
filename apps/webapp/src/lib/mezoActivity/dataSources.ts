import { getContractConfig } from "@/config/contracts"
import {
  classifyBoostContext,
  dedupeActivity,
  normalizeAddress,
  sortActivityDesc,
} from "@/lib/mezoActivity/normalize"
import type { MezoActivityCursor, MezoActivityItem } from "@/types/mezoActivity"
import { CHAIN_ID, type SupportedChainId } from "@repo/shared/contracts"
import {
  decodeFunctionData,
  getAddress,
  isAddressEqual,
  toFunctionSelector,
  type Address,
  type Hash,
  type Hex,
} from "viem"

const DEFAULT_RPC_BY_CHAIN: Record<SupportedChainId, string> = {
  [CHAIN_ID.mainnet]: "https://rpc-internal.mezo.org",
  [CHAIN_ID.testnet]: "https://rpc.test.mezo.org",
}

const DEFAULT_GOLDSKY_BY_CHAIN: Record<SupportedChainId, string> = {
  [CHAIN_ID.mainnet]:
    "https://api.goldsky.com/api/public/project_cm6ks2x8um4aj01uj8nwg1f6r/subgraphs/voting-escrow-mainnet/2.0.0/gn",
  [CHAIN_ID.testnet]:
    "https://api.goldsky.com/api/public/project_cm6ks2x8um4aj01uj8nwg1f6r/subgraphs/voting-escrow-testnet/2.0.0/gn",
}

const LOCK_CREATE_SELECTOR = toFunctionSelector("createLock(uint256,uint256)")
const LOCK_EXTEND_SELECTOR = toFunctionSelector("increaseUnlockTime(uint256,uint256)")
const BOOST_VOTE_SELECTOR = toFunctionSelector("vote(uint256,address[],uint256[])")
const BOOST_POKE_SELECTOR = toFunctionSelector("pokeBoost(uint256)")
const BOOST_PAIR_SELECTOR = toFunctionSelector(
  "createBoostGauge(address,uint256,address[],uint256[])",
)

type SourceOptions = {
  chainId: SupportedChainId
  fromBlock: bigint
  toBlock: bigint
  limit: number
  cursor?: MezoActivityCursor
}

type StakeResponse = {
  data?: {
    stakes: Array<{
      id: string
      amount: string
      lockDuration: string
      initializedAt: number
      staker: string
      transactionHash?: string
      blockNumber?: string
      logIndex?: string
    }>
  }
}

type JsonRpcLog = {
  transactionHash: Hash
  blockNumber: Hex
  logIndex: Hex
}

type JsonRpcTx = {
  hash: Hash
  from: Address
  to: Address | null
  input: Hex
}

type JsonRpcBlock = {
  timestamp: Hex
}

function getRpcUrl(chainId: SupportedChainId): string {
  if (chainId === CHAIN_ID.mainnet) {
    return (
      process.env.NEXT_PUBLIC_RPC_MAINNET_URL ??
      process.env.NEXT_PUBLIC_RPC_URL ??
      DEFAULT_RPC_BY_CHAIN[CHAIN_ID.mainnet]
    )
  }
  return (
    process.env.NEXT_PUBLIC_RPC_TESTNET_URL ??
    process.env.NEXT_PUBLIC_RPC_URL ??
    DEFAULT_RPC_BY_CHAIN[CHAIN_ID.testnet]
  )
}

function getGoldskyUrl(chainId: SupportedChainId): string {
  if (chainId === CHAIN_ID.mainnet) {
    return (
      process.env.NEXT_PUBLIC_GOLDSKY_VOTING_ESCROW_MAINNET_URL ??
      DEFAULT_GOLDSKY_BY_CHAIN[CHAIN_ID.mainnet]
    )
  }
  return (
    process.env.NEXT_PUBLIC_GOLDSKY_VOTING_ESCROW_TESTNET_URL ??
    DEFAULT_GOLDSKY_BY_CHAIN[CHAIN_ID.testnet]
  )
}

async function rpcRequest<T>(
  rpcUrl: string,
  method: string,
  params: unknown[],
): Promise<T> {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: `${method}-${Date.now()}`, method, params }),
  })
  const json = (await response.json()) as { result?: T; error?: { message: string } }
  if (json.error) {
    throw new Error(json.error.message)
  }
  if (json.result === undefined) {
    throw new Error(`No result from ${method}`)
  }
  return json.result
}

function asHex(value: bigint): Hex {
  return `0x${value.toString(16)}` as Hex
}

function applyCursor(items: MezoActivityItem[], cursor?: MezoActivityCursor) {
  if (!cursor) return items
  return items.filter((item) => {
    if (item.timestamp < cursor.timestamp) return true
    if (item.timestamp > cursor.timestamp) return false
    const itemIndex = item.logIndex ?? -1
    if (itemIndex < cursor.logIndex) return true
    if (itemIndex > cursor.logIndex) return false
    return item.txHash.toLowerCase() < cursor.txHash.toLowerCase()
  })
}

async function fetchSubgraphLocks(
  chainId: SupportedChainId,
  limit: number,
): Promise<MezoActivityItem[]> {
  try {
    const endpoint = getGoldskyUrl(chainId)
    const query = `
    query RecentStakes($limit: Int!) {
      stakes(first: $limit, orderBy: initializedAt, orderDirection: desc) {
        id
        amount
        lockDuration
        initializedAt
        staker
        transactionHash
        blockNumber
        logIndex
      }
    }
  `
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables: { limit } }),
    })
    if (!response.ok) return []
    const json = (await response.json()) as StakeResponse
    const stakes = json.data?.stakes ?? []
    return stakes.flatMap((stake) => {
      const txHash = stake.transactionHash
      if (!txHash || !/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
        return []
      }
      const actorAddress = normalizeAddress(stake.staker)
      const parsedBlockNumber =
        stake.blockNumber && /^-?\d+$/.test(stake.blockNumber)
          ? BigInt(stake.blockNumber)
          : 0n
      const parsedLogIndex =
        stake.logIndex && /^-?\d+$/.test(stake.logIndex)
          ? Number.parseInt(stake.logIndex, 10)
          : -1
      return {
        id: `subgraph-lock-${stake.id}-${stake.initializedAt}`,
        blockNumber: parsedBlockNumber,
        timestamp: Number(stake.initializedAt),
        txHash: txHash as Hash,
        ...(actorAddress ? { actorAddress } : {}),
        amount: BigInt(stake.amount),
        duration: BigInt(stake.lockDuration),
        actionType: "lockCreated" as const,
        boostContext: "unknown" as const,
        source: "subgraph" as const,
        logIndex: parsedLogIndex,
      }
    })
  } catch {
    return []
  }
}

async function fetchRpcActivity(options: SourceOptions): Promise<MezoActivityItem[]> {
  try {
    if (options.toBlock <= 0n) {
      return []
    }
    const rpcUrl = getRpcUrl(options.chainId)
    const contracts = getContractConfig(options.chainId)
    const watchedAddresses = [
      contracts.veMEZO.address,
      contracts.boostVoter.address,
      contracts.poolsVoter.address,
    ].map((value) => getAddress(value))

    const logs = await rpcRequest<JsonRpcLog[]>(rpcUrl, "eth_getLogs", [
      {
        address: watchedAddresses,
        fromBlock: asHex(options.fromBlock),
        toBlock: asHex(options.toBlock),
      },
    ])

  const uniqueTxHashes = [...new Set(logs.map((log) => log.transactionHash.toLowerCase()))]
  const txByHash = new Map<string, JsonRpcTx>()
  for (const txHash of uniqueTxHashes) {
    const tx = await rpcRequest<JsonRpcTx | null>(rpcUrl, "eth_getTransactionByHash", [
      txHash,
    ])
    if (tx) txByHash.set(txHash, tx)
  }

  const blockNumbers = [...new Set(logs.map((log) => log.blockNumber.toLowerCase()))]
  const blockTimestamps = new Map<string, number>()
  for (const blockHex of blockNumbers) {
    const block = await rpcRequest<JsonRpcBlock | null>(rpcUrl, "eth_getBlockByNumber", [
      blockHex,
      false,
    ])
    if (block) blockTimestamps.set(blockHex, Number(BigInt(block.timestamp)))
  }

  const items: MezoActivityItem[] = []
  for (const log of logs) {
    const tx = txByHash.get(log.transactionHash.toLowerCase())
    if (!tx) continue
    const toAddress = tx.to ? normalizeAddress(tx.to) : undefined
    if (!toAddress) continue

    let actionType: MezoActivityItem["actionType"] | null = null
    let tokenId: bigint | undefined
    let amount: bigint | undefined
    let duration: bigint | undefined
    let gaugeAddress: Address | undefined

    const selector = tx.input.slice(0, 10).toLowerCase()
    if (selector === LOCK_CREATE_SELECTOR.toLowerCase()) {
      const decoded = decodeFunctionData({
        abi: contracts.veMEZO.abi,
        data: tx.input,
      })
      actionType = "lockCreated"
      amount = decoded.args?.[0] as bigint | undefined
      duration = decoded.args?.[1] as bigint | undefined
    } else if (selector === LOCK_EXTEND_SELECTOR.toLowerCase()) {
      const decoded = decodeFunctionData({
        abi: contracts.veMEZO.abi,
        data: tx.input,
      })
      actionType = "lockExtended"
      tokenId = decoded.args?.[0] as bigint | undefined
      duration = decoded.args?.[1] as bigint | undefined
    } else if (selector === BOOST_VOTE_SELECTOR.toLowerCase()) {
      const decoded = decodeFunctionData({
        abi: contracts.boostVoter.abi,
        data: tx.input,
      })
      actionType = "boostVote"
      tokenId = decoded.args?.[0] as bigint | undefined
      const gauges = decoded.args?.[1] as Address[] | undefined
      gaugeAddress = gauges?.[0]
    } else if (selector === BOOST_POKE_SELECTOR.toLowerCase()) {
      const decoded = decodeFunctionData({
        abi: contracts.boostVoter.abi,
        data: tx.input,
      })
      actionType = "boostPoke"
      tokenId = decoded.args?.[0] as bigint | undefined
    } else if (selector === BOOST_PAIR_SELECTOR.toLowerCase()) {
      const decoded = decodeFunctionData({
        abi: contracts.boostVoter.abi,
        data: tx.input,
      })
      actionType = "pairCreated"
      tokenId = decoded.args?.[1] as bigint | undefined
    } else if (isAddressEqual(toAddress, contracts.poolsVoter.address as Address)) {
      actionType = "boostVote"
    }

    if (!actionType) continue

    const blockNumber = BigInt(log.blockNumber)
    const logIndex = Number(BigInt(log.logIndex))
    const timestamp = blockTimestamps.get(log.blockNumber.toLowerCase()) ?? 0
    const actorAddress = normalizeAddress(tx.from)
    items.push({
      id: `rpc-${log.transactionHash}-${log.logIndex}-${actionType}`,
      blockNumber,
      timestamp,
      txHash: log.transactionHash,
      ...(actorAddress ? { actorAddress } : {}),
      ...(tokenId !== undefined ? { tokenId } : {}),
      ...(amount !== undefined ? { amount } : {}),
      ...(duration !== undefined ? { duration } : {}),
      ...(gaugeAddress ? { gaugeAddress } : {}),
      actionType,
      boostContext: classifyBoostContext(toAddress, {
        boostVoter: contracts.boostVoter.address as Address,
        poolsVoter: contracts.poolsVoter.address as Address,
      }),
      source: "rpcLogs",
      logIndex,
    })
  }
    return items
  } catch {
    return []
  }
}

export async function fetchMezoActivity(options: SourceOptions): Promise<{
  data: MezoActivityItem[]
  nextCursor: MezoActivityCursor | null
}> {
  const [primaryItems, fallbackItems] = await Promise.all([
    fetchSubgraphLocks(options.chainId, Math.max(options.limit * 2, 50)),
    fetchRpcActivity(options),
  ])

  const merged = sortActivityDesc(dedupeActivity([...primaryItems, ...fallbackItems]))
  const filteredByCursor = applyCursor(merged, options.cursor)
  const page = filteredByCursor.slice(0, options.limit)
  const last = page[page.length - 1]

  return {
    data: page,
    nextCursor: last
      ? {
          timestamp: last.timestamp,
          txHash: last.txHash,
          logIndex: last.logIndex ?? -1,
        }
      : null,
  }
}
