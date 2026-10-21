import { CONTRACTS } from "@repo/shared/contracts"
import type { Address } from "viem"
import type {
  WireGaugeEpochs,
  WireIncentiveEpochs,
  WireTokenAmount,
} from "../../features/history/schema"
import { priceToMicroUsd } from "../../lib/money"
import { calculateAnnualizedReturnBasisPoints } from "../../lib/rewardOptimizer"
import { REWARD_ABI, VOTER_ABI, asAddress, asBigint, readAll } from "./chain"
import {
  type BoostBribe,
  boostBribes,
  depositKey,
  loadCheckpoints,
  sealedDeposits,
  supplyCalls,
} from "./earnings"
import { HistoryError } from "./http"
import { EPOCH, epochStartOf, priorIndex } from "./math"
import {
  type EpochClosePrice,
  type PriceRefs,
  type PricingEnv,
  closePricesWithin,
  currentPrices,
  epochClosePrices,
  mezoBlocksAtOrBefore,
  tokenPrice,
  usdMicro,
  usdString,
} from "./pricing"
import { sealedGet, sealedSet } from "./store"

// Gauge "Recent epochs" and the public "Incentives deposited" series, both
// from head-state bribe reads (supply checkpoints, tokenRewardsPerEpoch) plus
// archive reads for the boost at each epoch close.

type TokenLine = {
  token: Address
  symbol: string
  decimals: number
  amount: bigint
}

function priceLines(
  lines: readonly TokenLine[],
  refs: PriceRefs | null,
  atEarn: boolean,
  now: PriceRefs,
): { tokens: WireTokenAmount[]; usdMicro: bigint | null } {
  let total: bigint | null = 0n
  const tokens = lines
    .filter((line) => line.amount > 0n)
    .map((line) => {
      const earn = refs
        ? usdMicro(
            line.amount,
            line.decimals,
            tokenPrice(line.token, line.symbol, refs),
          )
        : null
      const current = usdMicro(
        line.amount,
        line.decimals,
        tokenPrice(line.token, line.symbol, now),
      )
      const value = atEarn ? earn : current
      total = value === null || total === null ? null : total + value
      return {
        token: line.token,
        symbol: line.symbol,
        decimals: line.decimals,
        amount: line.amount.toString(),
        usdAtEarn: atEarn ? usdString(earn) : null,
        usdNow: usdString(current),
      }
    })
  return { tokens, usdMicro: total }
}

function windowEpochs(currentEpoch: bigint, count: number): bigint[] {
  return Array.from(
    { length: count },
    (_, index) => currentEpoch - BigInt(index) * EPOCH,
  )
}

async function boostAtCloses(
  gauge: Address,
  boostTokenId: bigint | undefined,
  sealed: readonly bigint[],
): Promise<Map<bigint, bigint | null>> {
  const result = new Map<bigint, bigint | null>()
  if (boostTokenId === undefined) return result
  const voter = CONTRACTS.mainnet.boostVoter
  const [owner, live] = await readAll([
    {
      address: voter,
      abi: VOTER_ABI,
      functionName: "boostableTokenIdToGauge",
      args: [boostTokenId],
    },
    {
      address: voter,
      abi: VOTER_ABI,
      functionName: "getBoost",
      args: [boostTokenId],
    },
  ])
  if (asAddress(owner) !== gauge) return result
  result.set(-1n, asBigint(live) ?? null)
  const missing = sealed.filter(
    (epoch) =>
      sealedGet<bigint>(`boost:${boostTokenId}:${epoch}`) === undefined,
  )
  for (const epoch of sealed) {
    const hit = sealedGet<bigint>(`boost:${boostTokenId}:${epoch}`)
    if (hit !== undefined) result.set(epoch, hit)
  }
  if (missing.length === 0) return result
  const blocks = await mezoBlocksAtOrBefore(
    missing.map((epoch) => epoch + EPOCH - 1n),
  )
  const reads = await Promise.all(
    missing.map(async (epoch) => {
      const block = blocks.get(epoch + EPOCH - 1n)
      if (!block) return undefined
      const [value] = await readAll(
        [
          {
            address: voter,
            abi: VOTER_ABI,
            functionName: "getBoost",
            args: [boostTokenId],
          },
        ],
        block.number,
      ).catch(() => [undefined])
      return asBigint(value)
    }),
  )
  missing.forEach((epoch, index) => {
    const value = reads[index]
    result.set(epoch, value ?? null)
    if (value !== undefined) sealedSet(`boost:${boostTokenId}:${epoch}`, value)
  })
  return result
}

/**
 * The gauge's last `count` epochs, newest first (current epoch first). The
 * boost needs the gauge's veBTC token id (from its profile); without it the
 * boost column is null.
 */
export async function gaugeEpochsWithStatus(input: {
  gauge: Address
  count: number
  boostTokenId: bigint | undefined
  now: bigint
  env: PricingEnv
  /** Answer by this wall-clock deadline; unsettled prices keep loading. */
  budget?: PriceBudget | undefined
}): Promise<{ data: WireGaugeEpochs; complete: boolean }> {
  const bribes = await boostBribes()
  const bribe = bribes.find((item) => item.gauge === input.gauge)
  if (!bribe) {
    throw new HistoryError(404, "invalid_address", "Unknown boost gauge.")
  }
  const currentEpoch = epochStartOf(input.now)
  const epochs = windowEpochs(currentEpoch, input.count)
  const sealed = epochs.filter((epoch) => epoch < currentEpoch)

  const [supplyCount] = await readAll([
    {
      address: bribe.bribe,
      abi: REWARD_ABI,
      functionName: "supplyNumCheckpoints",
    },
  ])
  const count = asBigint(supplyCount) ?? 0n
  const supplyKey = `supply:${bribe.bribe}`
  const [checkpoints, deposits, closes, now, boosts] = await Promise.all([
    loadCheckpoints(
      [{ key: supplyKey, count, calls: supplyCalls(bribe.bribe, count) }],
      currentEpoch,
    ),
    sealedDeposits(
      sealed.flatMap((epoch) =>
        bribe.tokens.map((token) => ({
          bribe: bribe.bribe,
          token: token.token,
          epoch,
        })),
      ),
    ),
    closesFor(sealed, input),
    currentPrices(input.env),
    boostAtCloses(input.gauge, input.boostTokenId, sealed),
  ])
  const supplies = checkpoints.get(supplyKey) ?? []

  const data: WireGaugeEpochs = {
    rows: epochs.map((epoch) => {
      const isCurrent = epoch === currentEpoch
      const supplyIndex = priorIndex(supplies, epoch + EPOCH - 1n)
      const first = supplies[0]
      const veMezo =
        first && first.timestamp <= epoch + EPOCH - 1n
          ? (supplies[supplyIndex]?.value ?? 0n)
          : 0n
      const lines = bribe.tokens.map((token) => ({
        ...token,
        amount: isCurrent
          ? token.currentDeposit
          : (deposits.get(depositKey(bribe.bribe, token.token, epoch)) ?? 0n),
      }))
      const close = isCurrent ? now : (closes.get(epoch) ?? null)
      const priced = priceLines(lines, close, !isCurrent, now)
      const mezoPrice = close?.mezoUsd ?? null
      const apy =
        priced.usdMicro !== null && mezoPrice !== null
          ? calculateAnnualizedReturnBasisPoints({
              epochRewardMicroUsd: priced.usdMicro,
              votingPowers: [veMezo],
              assetPriceMicroUsd: priceToMicroUsd(mezoPrice),
            })
          : null
      const boost = boosts.get(isCurrent ? -1n : epoch) ?? null
      return {
        epochStart: epoch.toString(),
        epochEnd: (epoch + EPOCH).toString(),
        status: isCurrent ? "current" : "sealed",
        veMezo: veMezo.toString(),
        boostWad: boost === null ? null : boost.toString(),
        incentives: priced.tokens,
        incentivesUsd: usdString(priced.usdMicro),
        apyBps: apy === null ? null : apy.toString(),
      }
    }),
  }
  return { data, complete: settledAll(closes, sealed) }
}

/** The rows alone (Stuart's gauge tools); the route also uses `complete`. */
export async function gaugeEpochs(
  input: Parameters<typeof gaugeEpochsWithStatus>[0],
): Promise<WireGaugeEpochs> {
  return (await gaugeEpochsWithStatus(input)).data
}

export type PriceBudget = {
  deadline: number
  waitUntil: (promise: Promise<unknown>) => void
}

function closesFor(
  sealed: readonly bigint[],
  input: { env: PricingEnv; now: bigint; budget?: PriceBudget | undefined },
): Promise<Map<bigint, EpochClosePrice>> {
  return input.budget
    ? closePricesWithin(
        sealed,
        input.env,
        input.now,
        input.budget.deadline,
        input.budget.waitUntil,
      )
    : epochClosePrices(sealed, input.env, input.now)
}

/** Every sealed epoch's close price came back (no transient misses). */
function settledAll(
  closes: ReadonlyMap<bigint, EpochClosePrice>,
  sealed: readonly bigint[],
): boolean {
  return sealed.every((epoch) => closes.get(epoch)?.settled ?? false)
}

type EpochAggregate = {
  gauges: number
  lines: TokenLine[]
}

function aggregate(
  bribes: readonly BoostBribe[],
  amountOf: (bribe: BoostBribe, token: Address) => bigint,
): EpochAggregate {
  const byToken = new Map<string, TokenLine>()
  let gauges = 0
  for (const bribe of bribes) {
    let funded = false
    for (const token of bribe.tokens) {
      const amount = amountOf(bribe, token.token)
      if (amount === 0n) continue
      funded = true
      const line = byToken.get(token.token) ?? {
        token: token.token,
        symbol: token.symbol,
        decimals: token.decimals,
        amount: 0n,
      }
      line.amount += amount
      byToken.set(token.token, line)
    }
    if (funded) gauges += 1
  }
  return {
    gauges,
    lines: [...byToken.values()].sort((a, b) =>
      a.symbol.localeCompare(b.symbol),
    ),
  }
}

type SealedAggregate = {
  gauges: number
  lines: Array<{
    token: Address
    symbol: string
    decimals: number
    amount: string
  }>
}

/** Incentives deposited per epoch across every boost gauge, oldest first. */
export async function incentiveEpochs(input: {
  count: number
  now: bigint
  env: PricingEnv
  /** Answer by this wall-clock deadline; unsettled prices keep loading. */
  budget?: PriceBudget | undefined
}): Promise<{ data: WireIncentiveEpochs; complete: boolean }> {
  const bribes = await boostBribes()
  const currentEpoch = epochStartOf(input.now)
  const epochs = windowEpochs(currentEpoch, input.count).reverse()
  const sealed = epochs.filter((epoch) => epoch < currentEpoch)
  const sealedRows = new Map<bigint, EpochAggregate>()
  const missing: bigint[] = []
  for (const epoch of sealed) {
    const hit = sealedGet<SealedAggregate>(`incentives:${epoch}`)
    if (hit) {
      sealedRows.set(epoch, {
        gauges: hit.gauges,
        lines: hit.lines.map((line) => ({
          ...line,
          amount: BigInt(line.amount),
        })),
      })
    } else {
      missing.push(epoch)
    }
  }
  const [deposits, closes, now] = await Promise.all([
    sealedDeposits(
      missing.flatMap((epoch) =>
        bribes.flatMap((bribe) =>
          bribe.tokens.map((token) => ({
            bribe: bribe.bribe,
            token: token.token,
            epoch,
          })),
        ),
      ),
    ),
    closesFor(sealed, input),
    currentPrices(input.env),
  ])
  for (const epoch of missing) {
    const row = aggregate(
      bribes,
      (bribe, token) =>
        deposits.get(depositKey(bribe.bribe, token, epoch)) ?? 0n,
    )
    sealedRows.set(epoch, row)
    sealedSet(`incentives:${epoch}`, {
      gauges: row.gauges,
      lines: row.lines.map((line) => ({
        ...line,
        amount: line.amount.toString(),
      })),
    })
  }
  const live = aggregate(
    bribes,
    (bribe, token) =>
      bribe.tokens.find((item) => item.token === token)?.currentDeposit ?? 0n,
  )

  const data: WireIncentiveEpochs = {
    rows: epochs.map((epoch) => {
      const isCurrent = epoch === currentEpoch
      const row = isCurrent
        ? live
        : (sealedRows.get(epoch) ?? { gauges: 0, lines: [] })
      const priced = priceLines(
        row.lines,
        isCurrent ? now : (closes.get(epoch) ?? null),
        !isCurrent,
        now,
      )
      return {
        epochStart: epoch.toString(),
        epochEnd: (epoch + EPOCH).toString(),
        status: isCurrent ? "current" : "sealed",
        gauges: row.gauges,
        deposits: null,
        tokens: priced.tokens,
        usdAtDeposit: usdString(priced.usdMicro),
      }
    }),
  }
  return { data, complete: settledAll(closes, sealed) }
}
