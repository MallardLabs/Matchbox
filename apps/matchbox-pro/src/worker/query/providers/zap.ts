import type { Address } from "viem"
import { CL_POOL_ABI, ERC20_ABI, MAINNET, QUOTER_ABI } from "./abis"
import type { MezoClient } from "./rpc"

// Matchbox-approved swap routes and Earn destinations. Nothing outside this
// registry is ever quoted or prepared; dual-deposit LP pools stay
// unavailable until an approved dual-deposit router is added here.

export type ZapRoute = {
  routeId: string
  label: string
  tokenIn: Address
  tokenInSymbol: "MEZO"
  tokenOut: Address
  tokenOutSymbol: "MUSD"
  router: Address
  quoter: Address
  pool: Address
  tickSpacing: number
  warnImpactBps: number
  maxImpactBps: number
}

export type ZapDestination = {
  id: "musd-savings"
  name: string
  address: Address
  depositToken: Address
}

export const APPROVED_ZAP_ROUTES: readonly ZapRoute[] = [
  {
    routeId: "tigris-cl-mezo-musd-200",
    label: "Tigris CL MEZO/MUSD",
    tokenIn: MAINNET.mezo,
    tokenInSymbol: "MEZO",
    tokenOut: MAINNET.musd,
    tokenOutSymbol: "MUSD",
    router: MAINNET.clSwapRouter,
    quoter: MAINNET.clQuoter,
    pool: MAINNET.clPoolMezoMusd200,
    tickSpacing: 200,
    warnImpactBps: 50,
    maxImpactBps: 100,
  },
]

export const APPROVED_DESTINATIONS: readonly ZapDestination[] = [
  {
    id: "musd-savings",
    name: "MUSD Savings (sMUSD)",
    address: MAINNET.musdSavings,
    depositToken: MAINNET.musd,
  },
]

export type ZapMarket = {
  // MUSD per MEZO, 1e18-scaled, from the pool's slot0.
  mid: bigint
  feePips: number
  blockNumber: bigint
}

export type ZapQuote = {
  amountIn: bigint
  amountOut: bigint
}

export type TokenPosition = {
  balance: bigint
  allowance: bigint
  blockNumber: bigint
}

const Q192 = 2n ** 192n

export async function loadZapMarket(
  client: MezoClient,
  route: ZapRoute,
): Promise<ZapMarket> {
  const [slot0, fee, blockNumber] = await Promise.all([
    client.readContract({
      address: route.pool,
      abi: CL_POOL_ABI,
      functionName: "slot0",
    }),
    client.readContract({
      address: route.pool,
      abi: CL_POOL_ABI,
      functionName: "fee",
    }),
    client.getBlockNumber(),
  ])
  const sqrtPrice = slot0[0]
  return {
    mid: (sqrtPrice * sqrtPrice * 10n ** 18n) / Q192,
    feePips: fee,
    blockNumber,
  }
}

export async function loadZapQuote(
  client: MezoClient,
  route: ZapRoute,
  amountIn: bigint,
): Promise<ZapQuote> {
  const { result } = await client.simulateContract({
    address: route.quoter,
    abi: QUOTER_ABI,
    functionName: "quoteExactInputSingle",
    args: [
      {
        tokenIn: route.tokenIn,
        tokenOut: route.tokenOut,
        amountIn,
        tickSpacing: route.tickSpacing,
        sqrtPriceLimitX96: 0n,
      },
    ],
  })
  return { amountIn, amountOut: result[0] }
}

export async function loadTokenPosition(
  client: MezoClient,
  token: Address,
  owner: Address,
  spender: Address,
): Promise<TokenPosition> {
  const [balance, allowance, blockNumber] = await Promise.all([
    client.readContract({
      address: token,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [owner],
    }),
    client.readContract({
      address: token,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [owner, spender],
    }),
    client.getBlockNumber(),
  ])
  return { balance, allowance, blockNumber }
}

/** USD notional (1e18) → MEZO in, rounded up, at the pool mid price. */
export function amountInForUsd(usd: bigint, mid: bigint): bigint {
  if (mid <= 0n) return 0n
  return (usd * 10n ** 18n + mid - 1n) / mid
}

/** Shortfall vs the fee-adjusted mid price, in bps (≥ 0). */
export function priceImpactBps(input: {
  amountIn: bigint
  amountOut: bigint
  mid: bigint
  feePips: number
}): number {
  const ideal =
    (input.amountIn * input.mid * (1_000_000n - BigInt(input.feePips))) /
    (10n ** 18n * 1_000_000n)
  if (ideal <= 0n || input.amountOut >= ideal) return 0
  return Number(((ideal - input.amountOut) * 10_000n) / ideal)
}

export function minOutFor(amountOut: bigint, slippageBps: number): bigint {
  return (amountOut * BigInt(10_000 - slippageBps)) / 10_000n
}
