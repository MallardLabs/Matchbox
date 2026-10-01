import { CONTRACTS } from "@repo/shared/contracts"
import { zeroAddress } from "viem"
import { z } from "zod"

import {
  WAREHOUSE_NETWORK,
  type WarehouseQuery,
  queryWarehouse,
  sqlParams,
} from "@/lib/warehouse"

import { replayVoteEvents } from "./participation"
import type {
  SubgraphVote,
  ThirdPartyRewardEvent,
  VeMezoLockCreation,
} from "./subgraph"

// Gauges-tab reads from the warehouse's explorer-compatible tables. Same
// shapes as the subgraph readers in ./subgraph.ts.

// numeric and bigint columns are selected as ::text.
const integerText = z.string().regex(/^\d+$/)

const rewardRowSchema = z.object({
  gauge: z.string(),
  amount: integerText,
  timestamp: integerText,
  actionType: z.enum(["REWARD_DISTRIBUTED", "REWARD_NOTIFIED"]),
})

export function buildThirdPartyRewardQuery(options: {
  fromTs: number
  toTs: number
}): WarehouseQuery {
  const { params, add } = sqlParams()
  const text = `SELECT "gauge", "amount"::text AS "amount",
      "timestamp"::text AS "timestamp", "action_type" AS "actionType"
    FROM matchbox.activity_events
    WHERE "network" = ${add(WAREHOUSE_NETWORK)}
      AND "action_type" = ANY(${add(["REWARD_DISTRIBUTED", "REWARD_NOTIFIED"])}::text[])
      AND "source" = 'THIRD_PARTY_VOTER'
      AND "timestamp" >= ${add(String(Math.trunc(options.fromTs)))}
      AND "timestamp" <= ${add(String(Math.trunc(options.toTs)))}
      AND "gauge" IS NOT NULL AND "amount" IS NOT NULL
    ORDER BY "action_type", "timestamp", "block_number", "log_index"`
  return { text, params }
}

export async function fetchWarehouseThirdPartyRewardEvents(options: {
  fromTs: number
  toTs: number
}): Promise<ThirdPartyRewardEvent[]> {
  const rows = await queryWarehouse(buildThirdPartyRewardQuery(options))
  return rows.map((raw) => {
    const row = rewardRowSchema.parse(raw)
    return {
      gauge: row.gauge,
      amount: BigInt(row.amount),
      timestamp: Number(row.timestamp),
      actionType: row.actionType,
    }
  })
}

const lockCreationRowSchema = z.object({
  tokenId: integerText,
  timestamp: integerText,
})

export async function fetchWarehouseVeMezoLockCreations(options: {
  fromTs: number
  toTs: number
}): Promise<VeMezoLockCreation[]> {
  const { params, add } = sqlParams()
  const rows = await queryWarehouse({
    text: `SELECT "token_id"::text AS "tokenId", "timestamp"::text AS "timestamp"
      FROM matchbox.activity_events
      WHERE "network" = ${add(WAREHOUSE_NETWORK)}
        AND "action_type" = 'LOCK_CREATED'
        AND "contract_address" = ${add(CONTRACTS.mainnet.veMEZO.toLowerCase())}
        AND "timestamp" >= ${add(String(Math.trunc(options.fromTs)))}
        AND "timestamp" <= ${add(String(Math.trunc(options.toTs)))}
        AND "token_id" IS NOT NULL
      ORDER BY "timestamp", "block_number", "log_index"`,
    params,
  })
  return rows.map((raw) => {
    const row = lockCreationRowSchema.parse(raw)
    return {
      timestamp: Number(row.timestamp),
      tokenId: BigInt(row.tokenId),
    }
  })
}

const voteEventRowSchema = z.object({
  actionType: z.enum(["BOOST_VOTE", "BOOST_ABSTAIN"]),
  tokenId: integerText,
  gauge: z.string(),
  weight: integerText,
  actor: z.string().nullable(),
  timestamp: integerText,
})

/**
 * Active third-party votes at a block, replayed from the warehouse's
 * BOOST_VOTE / BOOST_ABSTAIN rows up to that block. Votes after the
 * projection checkpoint aren't in the warehouse yet.
 */
export async function fetchWarehouseThirdPartyVotes(options: {
  blockNumber: bigint
}): Promise<SubgraphVote[]> {
  const { params, add } = sqlParams()
  const raw = await queryWarehouse({
    text: `SELECT "action_type" AS "actionType", "token_id"::text AS "tokenId",
        "gauge", "weight"::text AS "weight", "actor",
        "timestamp"::text AS "timestamp"
      FROM matchbox.activity_events
      WHERE "network" = ${add(WAREHOUSE_NETWORK)}
        AND "action_type" = ANY(${add(["BOOST_VOTE", "BOOST_ABSTAIN"])}::text[])
        AND "source" = 'THIRD_PARTY_VOTER'
        AND "block_number" <= ${add(options.blockNumber.toString())}
        AND "token_id" IS NOT NULL AND "gauge" IS NOT NULL
        AND "weight" IS NOT NULL
      ORDER BY "block_number", "log_index"`,
    params,
  })
  const rows = raw.map((row) => voteEventRowSchema.parse(row))
  const positions = replayVoteEvents(
    rows.map((row) => ({
      tokenId: BigInt(row.tokenId),
      gauge: row.gauge,
      type: row.actionType === "BOOST_VOTE" ? "Voted" : "Abstained",
      weight: BigInt(row.weight),
    })),
  )
  // Rows are in chain order, so the last write per key is the latest voter.
  const latest = new Map<string, { actor: string; timestamp: number }>()
  for (const row of rows) {
    latest.set(`${row.tokenId}:${row.gauge.toLowerCase()}`, {
      actor: row.actor ?? "",
      timestamp: Number(row.timestamp),
    })
  }
  return positions.map((position) => {
    const last = latest.get(`${position.tokenId}:${position.gauge}`)
    return {
      tokenId: position.tokenId,
      owner: last?.actor ?? "",
      gauge: position.gauge,
      currentWeight: position.currentWeight,
      lastUpdatedAt: last?.timestamp ?? 0,
    }
  })
}

const ownerRowSchema = z.object({ tokenId: integerText, owner: z.string() })

/**
 * Current veMEZO owners from the warehouse's LockPosition rows, keyed by
 * tokenId string. Only NFTs minted inside the indexed range have an owner
 * tracked from mint: older ones (created_at null) carry the first indexed
 * event's sender, e.g. the rebase distributor. Burned NFTs (merged or
 * withdrawn) have no current owner but did at earlier snapshot blocks. Both
 * are left to the caller's on-chain fallback at the snapshot block, like
 * NFTs with no row.
 */
export async function fetchWarehouseVeMezoOwners(
  tokenIds: readonly bigint[],
): Promise<Map<string, string>> {
  const owners = new Map<string, string>()
  if (tokenIds.length === 0) return owners
  const escrow = CONTRACTS.mainnet.veMEZO.toLowerCase()
  const ids = [...new Set(tokenIds.map((id) => `${escrow}-${id.toString()}`))]
  const { params, add } = sqlParams()
  const rows = await queryWarehouse({
    text: `SELECT "token_id"::text AS "tokenId", "owner"
      FROM matchbox.lock_positions
      WHERE "network" = ${add(WAREHOUSE_NETWORK)}
        AND "id" = ANY(${add(ids)}::text[])
        AND "owner" IS NOT NULL
        AND "owner" <> ${add(zeroAddress)}
        AND "created_at" IS NOT NULL
        AND NOT "is_merged" AND NOT "is_withdrawn"`,
    params,
  })
  for (const raw of rows) {
    const row = ownerRowSchema.parse(raw)
    owners.set(row.tokenId, row.owner.toLowerCase())
  }
  return owners
}
