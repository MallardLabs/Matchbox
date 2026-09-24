import { z } from "zod"

const gaugeSnapshotSchema = z.object({
  address: z.string(),
  name: z.string(),
  protocol: z.string(),
  /** Whether the gauge is in the MEZO_GAUGES registry. */
  listed: z.boolean(),
  /**
   * "error" when the on-chain read for this gauge failed — isAlive/weight/
   * shareBps are then null rather than silently reported as killed/0.
   */
  status: z.enum(["ok", "error"]),
  isAlive: z.boolean().nullable(),
  weight: z.string().nullable(),
  shareBps: z.string().nullable(),
})

export const mezoGaugesSnapshotSchema = z.object({
  blockNumber: z.string(),
  blockTimestamp: z.number(),
  epochStart: z.number(),
  epochIndex: z.number(),
  totalWeight: z.string(),
  totalVotingPower: z.string(),
  supply: z.string(),
  tokenId: z.string(),
  participationBps: z.string(),
  votingNfts: z.number(),
  wallets: z.number(),
  topWallet: z
    .object({ owner: z.string(), weight: z.string(), shareBps: z.string() })
    .nullable(),
  byWallet: z.array(
    z.object({
      owner: z.string(),
      weight: z.string(),
      shareBps: z.string(),
      gauges: z.array(z.string()),
    }),
  ),
  gauges: z.array(gaugeSnapshotSchema),
  /** Subgraph votes summed at the same block. */
  subgraphTotalWeight: z.string(),
  reconciled: z.boolean(),
  reconciliationDiff: z.string(),
})

export type MezoGaugesSnapshot = z.infer<typeof mezoGaugesSnapshotSchema>

export const mezoGaugesHistorySchema = z.object({
  entries: z.array(
    z.object({
      kind: z.enum(["baseline", "epochClose"]),
      at: z.number(),
      snapshot: mezoGaugesSnapshotSchema,
    }),
  ),
})
export type MezoGaugesHistory = z.infer<typeof mezoGaugesHistorySchema>

export const mezoGaugesEmissionsSchema = z.object({
  since: z.number(),
  currentEpochStart: z.number(),
  distributedByEpoch: z.array(
    z.object({
      /**
       * The vote epoch these rewards pay for — distributions execute at the
       * epoch flip, so the event timestamp's epoch is one ahead of this.
       */
      voteEpochStart: z.number(),
      total: z.string(),
      gauges: z.array(
        z.object({
          gauge: z.string(),
          name: z.string(),
          listed: z.boolean(),
          amount: z.string(),
        }),
      ),
    }),
  ),
  currentEpochBribes: z.array(
    z.object({
      gauge: z.string(),
      /** "error" when the bribe reads failed — rewards is then empty. */
      status: z.enum(["ok", "error"]),
      bribe: z.string(),
      rewards: z.array(z.object({ token: z.string(), amount: z.string() })),
    }),
  ),
})
export type MezoGaugesEmissions = z.infer<typeof mezoGaugesEmissionsSchema>

export const venueLiquiditySchema = z.object({
  tvlUsd: z.string().nullable(),
  composition: z.array(z.object({ token: z.string(), amount: z.string() })),
  volume24hUsd: z.string().nullish(),
  volume7dUsd: z.string().nullish(),
  source: z.string(),
  status: z.enum(["ok", "unavailable"]),
})
export const mezoGaugesLiquiditySchema = z.object({
  venues: z.record(z.string(), venueLiquiditySchema),
})
export type MezoGaugesLiquidityResponse = z.infer<
  typeof mezoGaugesLiquiditySchema
>

export const merklCampaignSchema = z.object({
  id: z.string(),
  campaignId: z.string().optional(),
  opportunityId: z.string().optional(),
  amount: z.string().nullable(),
  apr: z.string().nullable(),
  startTimestamp: z.number().nullable(),
  endTimestamp: z.number().nullable(),
  rewardToken: z.string(),
})
export const merklClaimsSchema = z.object({
  status: z.enum(["ok", "unavailable"]),
  distributor: z.string(),
  rewardToken: z.string(),
  distributed: z.string(),
  claimed: z.string(),
  unclaimed: z.string(),
  claimRateBps: z.string(),
  claimants: z.number(),
})
export const mezoGaugesMerklSchema = z.object({
  campaigns: z.record(z.string(), z.array(merklCampaignSchema)),
  claims: merklClaimsSchema,
})
export type MezoGaugesMerkl = z.infer<typeof mezoGaugesMerklSchema>

export const mezoGaugesLocksSchema = z.object({
  weekly: z.array(z.object({ epochStart: z.number(), count: z.number() })),
  pre14d: z.object({
    from: z.number(),
    to: z.number(),
    count: z.number(),
  }),
  post14d: z.object({
    from: z.number(),
    to: z.number(),
    count: z.number(),
  }),
  total: z.number(),
})
export type MezoGaugesLocks = z.infer<typeof mezoGaugesLocksSchema>
