import { z } from "zod"
import type { WireLedgerRow } from "../../features/history/schema"
import { queryBatch, sqlParams } from "./neon"
import type { SourceConfig } from "./sources"

// Claim transactions for ledger rows, from the warehouse's bribe-claim rows
// (decoder v2 indexes boost / validator / third-party bribe claims, with the
// claimed lock when the claim went straight to a voter). Claim *status*
// always comes from `lastEarn` on chain; this only adds the tx link.

export type ClaimRow = {
  txHash: string
  blockNumber: bigint
  logIndex: bigint
  timestamp: bigint
  rewardContract: string
  token: string
  /** The claimed lock, when the claim's calldata named it. */
  tokenId: bigint | null
}

const claimRowSchema = z.object({
  tx_hash: z.string().regex(/^0x[0-9a-f]{64}$/),
  block_number: z.string().regex(/^\d+$/),
  log_index: z.string().regex(/^\d+$/),
  timestamp: z.string().regex(/^\d+$/),
  reward_contract: z.string().regex(/^0x[0-9a-f]{40}$/),
  token: z.string().regex(/^0x[0-9a-f]{40}$/),
  token_id: z.string().regex(/^\d+$/).nullable().optional(),
})

const versionSchema = z.object({ decoder_version: z.string().regex(/^\d+$/) })

/** Decoder version of the warehouse projection (2+ indexes bribe claims). */
export async function warehouseDecoderVersion(
  config: SourceConfig,
  fetcher: typeof fetch = fetch,
): Promise<number | null> {
  if (!config.warehouseUrl) return null
  try {
    const [rows = []] = await queryBatch(
      config.warehouseUrl,
      [
        {
          text: `SELECT decoder_version::text AS decoder_version
            FROM matchbox.projection_state WHERE network = $1`,
          params: ["mezo"],
        },
      ],
      fetcher,
    )
    const parsed = versionSchema.safeParse(rows[0])
    return parsed.success ? Number(parsed.data.decoder_version) : null
  } catch {
    return null
  }
}

/** The wallet's bribe claims on these reward contracts, oldest first. */
export async function walletClaims(
  config: SourceConfig,
  wallet: string,
  rewardContracts: readonly string[],
  fetcher: typeof fetch = fetch,
): Promise<ClaimRow[] | null> {
  if (!config.warehouseUrl || rewardContracts.length === 0) return null
  const { params, add } = sqlParams()
  const text = `SELECT tx_hash, block_number::text AS block_number,
      log_index::text AS log_index, timestamp::text AS timestamp,
      reward_contract, token, token_id::text AS token_id
    FROM matchbox.activity_events
    WHERE network = ${add("mezo")} AND actor = ${add(wallet)}
      AND action_type = 'VOTE_BRIBE_CLAIMED'
      AND reward_contract = ANY(${add(rewardContracts)}::text[])
    ORDER BY timestamp ASC, block_number ASC, log_index ASC`
  try {
    const [rows = []] = await queryBatch(
      config.warehouseUrl,
      [{ text, params }],
      fetcher,
    )
    return rows.flatMap((row) => {
      const parsed = claimRowSchema.safeParse(row)
      if (!parsed.success) return []
      const value = parsed.data
      return [
        {
          txHash: value.tx_hash,
          blockNumber: BigInt(value.block_number),
          logIndex: BigInt(value.log_index),
          timestamp: BigInt(value.timestamp),
          rewardContract: value.reward_contract,
          token: value.token,
          tokenId:
            value.token_id === null || value.token_id === undefined
              ? null
              : BigInt(value.token_id),
        },
      ]
    })
  } catch {
    return null
  }
}

/**
 * A claimed epoch was paid by the lock's first claim on that reward contract
 * and token after the epoch closed. Claims that don't name a lock may belong
 * to another of the wallet's locks, so a match on one is `wallet` confidence.
 */
export function linkClaims(
  rows: readonly WireLedgerRow[],
  claims: readonly ClaimRow[],
): WireLedgerRow[] {
  return rows.map((row) => {
    if (row.status !== "claimed") return row
    const epochEnd = BigInt(row.epochEnd)
    const tokenId = BigInt(row.tokenId)
    const claim = claims.find(
      (candidate) =>
        candidate.rewardContract === row.rewardContract &&
        candidate.token === row.token &&
        candidate.timestamp >= epochEnd &&
        (candidate.tokenId === null || candidate.tokenId === tokenId),
    )
    if (!claim) return row
    return {
      ...row,
      claim: {
        txHash: claim.txHash,
        blockNumber: claim.blockNumber.toString(),
        timestamp: claim.timestamp.toString(),
        confidence: claim.tokenId === tokenId ? "exact" : "wallet",
      },
    }
  })
}
