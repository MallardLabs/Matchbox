import { normalizeAddress } from "@/lib/mezoActivity/normalize"
import {
  EARN_LOCKS_MEZO_URL,
  EARN_PAGE_SIZE,
  EARN_VOTES_MEZO_URL,
  earnRows,
  fetchStakeOwners,
  queryEarnSubgraph,
  secondsToTimeseries,
  timeseriesToSeconds,
  tokenIdFromStakeId,
} from "@/lib/mezoEarn"
import type {
  MezoActivityContract,
  MezoActivityItem,
  MezoBoostContext,
} from "@/types/mezoActivity"
import {
  CHAIN_ID,
  CONTRACTS,
  type SupportedChainId,
} from "@repo/shared/contracts"
import type { Hash } from "viem"
import { z } from "zod"

type VoterRecord = {
  source: string
  address: string
  // The escrow whose NFTs vote here, from each voter's on-chain `ve()`.
  // earn-votes `VotingContract.votingVe` mislabels ThirdPartyVoter as veBTC.
  escrow: string
  contract: MezoActivityContract
  boostContext: MezoBoostContext
}

const VE_MEZO = CONTRACTS.mainnet.veMEZO.toLowerCase()
const VE_BTC = CONTRACTS.mainnet.veBTC.toLowerCase()

const VOTERS: readonly VoterRecord[] = [
  {
    source: "BOOST_VOTER",
    address: CONTRACTS.mainnet.boostVoter.toLowerCase(),
    escrow: VE_MEZO,
    contract: "boostVoter",
    boostContext: "mezoVeBtcPairBoost",
  },
  {
    source: "POOLS_VOTER",
    address: CONTRACTS.mainnet.poolsVoter.toLowerCase(),
    escrow: VE_BTC,
    contract: "poolsVoter",
    boostContext: "matchboxGaugeBoost",
  },
  {
    source: "THIRD_PARTY_VOTER",
    address: CONTRACTS.mainnet.thirdPartyVoter.toLowerCase(),
    escrow: VE_MEZO,
    contract: "thirdPartyVoter",
    boostContext: "unknown",
  },
  {
    source: "VALIDATORS_VOTER",
    address: CONTRACTS.mainnet.validatorsVoter.toLowerCase(),
    escrow: VE_BTC,
    contract: "validatorsVoter",
    boostContext: "unknown",
  },
]

const TOKEN_ID_CHUNK = 200

export type EarnVoteActivityOptions = {
  chainId: SupportedChainId
  fromTimestamp: number
  toTimestamp: number
  // First `limit` matching votes in the window, in `orderDirection` (newest
  // first by default). Callers page after merging.
  limit: number
  orderDirection?: "asc" | "desc" | undefined
  actionTypes?: string[] | undefined
  actor?: string | undefined
  gauge?: string | undefined
  source?: string | undefined
}

const earnVoteEventSchema = z.object({
  id: z.string(),
  voter: z.string(),
  timestamp: z.string(),
  txHash: z.string(),
  type: z.string(),
  tokenId: z.string(),
  weight: z.string(),
  totalWeight: z.string(),
  votingContract: z.object({ id: z.string() }),
  gauge: z.object({ address: z.string() }),
})

export type EarnVoteEvent = z.infer<typeof earnVoteEventSchema>

const actorStakeSchema = z.object({ id: z.string(), token: z.string() })

function voterForAddress(address: string): VoterRecord | undefined {
  const key = address.toLowerCase()
  return VOTERS.find((voter) => voter.address === key)
}

function isTxHash(value: string): value is Hash {
  return /^0x[a-fA-F0-9]{64}$/.test(value)
}

function decimalToBigInt(value: string): bigint | undefined {
  return /^\d+$/.test(value) ? BigInt(value) : undefined
}

function voteActionType(
  voteType: string,
): "boostVote" | "boostAbstain" | undefined {
  if (voteType === "Voted") return "boostVote"
  if (voteType === "Abstained") return "boostAbstain"
  return undefined
}

/**
 * The explorer records `voter` (msg.sender) as the actor, except on pokes
 * where it resolves the lock owner. earn-votes has no calldata to tell them
 * apart, so prefer the owner and fall back to the voter.
 */
export function mapEarnVoteToActivity(
  event: EarnVoteEvent,
  owner: string | undefined,
): MezoActivityItem | undefined {
  if (!isTxHash(event.txHash)) return undefined
  const actionType = voteActionType(event.type)
  const tokenId = decimalToBigInt(event.tokenId)
  const weight = decimalToBigInt(event.weight)
  const totalWeight = decimalToBigInt(event.totalWeight)
  const timestamp = timeseriesToSeconds(event.timestamp)
  const gaugeAddress = normalizeAddress(event.gauge.address)
  if (
    !actionType ||
    tokenId === undefined ||
    weight === undefined ||
    totalWeight === undefined ||
    timestamp === undefined ||
    !gaugeAddress
  ) {
    return undefined
  }
  const voter = voterForAddress(event.votingContract.id)
  const actorAddress = normalizeAddress(owner) ?? normalizeAddress(event.voter)
  return {
    id: `earn-vote:${event.id}`,
    blockNumber: 0n,
    timestamp,
    txHash: event.txHash,
    ...(actorAddress ? { actorAddress } : {}),
    tokenId,
    weight,
    totalWeight,
    gaugeAddress,
    actionType,
    boostContext: voter?.boostContext ?? "unknown",
    contract: voter?.contract ?? "unknown",
    source: "api",
  }
}

type VoteQuery = {
  fromTimestamp: number
  toTimestamp: number
  first: number
  orderDirection?: "asc" | "desc" | undefined
  voters: readonly VoterRecord[]
  type?: "Voted" | "Abstained" | undefined
  gauge?: string | undefined
  tokenIds?: readonly string[] | undefined
  voter?: string | undefined
}

export function voteEventsQuery(query: VoteQuery): string {
  const where = [
    `timestamp_gte: "${secondsToTimeseries(query.fromTimestamp)}"`,
    `timestamp_lte: "${secondsToTimeseries(query.toTimestamp)}"`,
    `votingContract_in: ${JSON.stringify(query.voters.map((v) => v.address))}`,
  ]
  if (query.type) where.push(`type: ${query.type}`)
  if (query.gauge) {
    where.push(`gauge_: { address: "${query.gauge.toLowerCase()}" }`)
  }
  if (query.tokenIds)
    where.push(`tokenId_in: ${JSON.stringify(query.tokenIds)}`)
  if (query.voter) where.push(`voter: "${query.voter.toLowerCase()}"`)
  return `query {
    voteEvents(
      first: ${query.first},
      orderBy: timestamp,
      orderDirection: ${query.orderDirection === "asc" ? "asc" : "desc"},
      where: { ${where.join(", ")} }
    ) {
      id
      voter
      timestamp
      txHash
      type
      tokenId
      weight
      totalWeight
      votingContract { id }
      gauge { address }
    }
  }`
}

async function fetchVoteEvents(query: VoteQuery): Promise<EarnVoteEvent[]> {
  if (query.voters.length === 0 || query.first <= 0) return []
  if (query.tokenIds && query.tokenIds.length === 0) return []
  const data = await queryEarnSubgraph(
    EARN_VOTES_MEZO_URL,
    voteEventsQuery(query),
  )
  return earnRows(data, "voteEvents", earnVoteEventSchema)
}

/** Every NFT the actor currently holds or last held, grouped by escrow. */
async function fetchActorTokenIds(
  actor: string,
): Promise<Map<string, string[]>> {
  const byEscrow = new Map<string, string[]>()
  let lastId = ""
  for (;;) {
    const cursor = lastId ? `, id_gt: "${lastId}"` : ""
    const data = await queryEarnSubgraph(
      EARN_LOCKS_MEZO_URL,
      `query {
        stakes(
          first: ${EARN_PAGE_SIZE},
          orderBy: id,
          orderDirection: asc,
          where: { staker: "${actor.toLowerCase()}"${cursor} }
        ) {
          id
          token
        }
      }`,
    )
    const rows = earnRows(data, "stakes", actorStakeSchema)
    for (const row of rows) {
      const tokenId = tokenIdFromStakeId(row.id)
      if (tokenId === undefined) continue
      const escrow = row.token.toLowerCase()
      const ids = byEscrow.get(escrow) ?? []
      ids.push(tokenId.toString())
      byEscrow.set(escrow, ids)
    }
    const last = rows.at(-1)
    if (rows.length < EARN_PAGE_SIZE || !last) break
    lastId = last.id
  }
  return byEscrow
}

function compareEventsDesc(a: EarnVoteEvent, b: EarnVoteEvent): number {
  const at = BigInt(a.timestamp)
  const bt = BigInt(b.timestamp)
  if (at !== bt) return bt > at ? 1 : -1
  const ai = BigInt(a.id)
  const bi = BigInt(b.id)
  if (ai === bi) return 0
  return bi > ai ? 1 : -1
}

function compareEvents(
  orderDirection: "asc" | "desc" | undefined,
): (a: EarnVoteEvent, b: EarnVoteEvent) => number {
  return orderDirection === "asc"
    ? (a, b) => compareEventsDesc(b, a)
    : compareEventsDesc
}

function selectedVoters(source: string | undefined): readonly VoterRecord[] {
  if (!source) return VOTERS
  return VOTERS.filter((voter) => voter.source === source)
}

function selectedType(
  actionTypes: string[] | undefined,
): "Voted" | "Abstained" | "both" | "none" {
  if (!actionTypes || actionTypes.length === 0) return "both"
  const vote = actionTypes.includes("BOOST_VOTE")
  const abstain = actionTypes.includes("BOOST_ABSTAIN")
  if (vote && abstain) return "both"
  if (vote) return "Voted"
  if (abstain) return "Abstained"
  return "none"
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = []
  for (let start = 0; start < items.length; start += size) {
    out.push(items.slice(start, start + size))
  }
  return out
}

/** Resolve owners per escrow, reusing any already known. */
async function resolveOwners(
  events: readonly EarnVoteEvent[],
  known: Map<string, string>,
): Promise<Map<string, string>> {
  const missingByEscrow = new Map<string, bigint[]>()
  for (const event of events) {
    const voter = voterForAddress(event.votingContract.id)
    if (!voter) continue
    const key = `${voter.escrow}:${event.tokenId}`
    if (known.has(key)) continue
    const tokenId = decimalToBigInt(event.tokenId)
    if (tokenId === undefined) continue
    const ids = missingByEscrow.get(voter.escrow) ?? []
    ids.push(tokenId)
    missingByEscrow.set(voter.escrow, ids)
  }
  const owners = new Map(known)
  await Promise.all(
    [...missingByEscrow].map(async ([escrow, tokenIds]) => {
      const found = await fetchStakeOwners(tokenIds, escrow)
      for (const [tokenId, owner] of found) {
        owners.set(`${escrow}:${tokenId}`, owner)
      }
    }),
  )
  return owners
}

/**
 * Votes and abstains from Mezo's earn-votes subgraph. Throws
 * `EarnSubgraphError` when the subgraph can't be read, so callers can tell a
 * failure from an empty window.
 */
export async function fetchEarnVoteActivity(
  options: EarnVoteActivityOptions,
): Promise<MezoActivityItem[]> {
  if (options.chainId !== CHAIN_ID.mainnet) return []
  const type = selectedType(options.actionTypes)
  if (type === "none") return []
  const voters = selectedVoters(options.source)
  const first = Math.min(Math.max(0, Math.floor(options.limit)), EARN_PAGE_SIZE)
  if (voters.length === 0 || first <= 0) return []

  const base = {
    fromTimestamp: options.fromTimestamp,
    toTimestamp: options.toTimestamp,
    first,
    orderDirection: options.orderDirection,
    ...(type === "both" ? {} : { type }),
    gauge: options.gauge,
  }

  const known = new Map<string, string>()
  let events: EarnVoteEvent[]
  if (options.actor) {
    // Votes on the actor's NFTs (including keeper pokes) plus votes the actor
    // sent for NFTs they don't hold.
    const actor = options.actor.toLowerCase()
    const tokenIdsByEscrow = await fetchActorTokenIds(actor)
    const queries: Promise<EarnVoteEvent[]>[] = [
      fetchVoteEvents({ ...base, voters, voter: actor }),
    ]
    for (const [escrow, tokenIds] of tokenIdsByEscrow) {
      for (const tokenId of tokenIds) known.set(`${escrow}:${tokenId}`, actor)
      const escrowVoters = voters.filter((voter) => voter.escrow === escrow)
      for (const ids of chunk(tokenIds, TOKEN_ID_CHUNK)) {
        queries.push(
          fetchVoteEvents({ ...base, voters: escrowVoters, tokenIds: ids }),
        )
      }
    }
    const byId = new Map<string, EarnVoteEvent>()
    for (const rows of await Promise.all(queries)) {
      for (const row of rows) byId.set(row.id, row)
    }
    events = [...byId.values()]
      .sort(compareEvents(options.orderDirection))
      .slice(0, first)
  } else {
    events = await fetchVoteEvents({ ...base, voters })
  }

  const owners = await resolveOwners(events, known)
  return events.flatMap((event) => {
    const voter = voterForAddress(event.votingContract.id)
    const owner = voter
      ? owners.get(`${voter.escrow}:${event.tokenId}`)
      : undefined
    const item = mapEarnVoteToActivity(event, owner)
    return item ? [item] : []
  })
}
