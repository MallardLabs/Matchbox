import { type Address, getAddress } from "viem"

export type MezoGaugeProtocol = "Aerodrome" | "Uniswap v4" | "Curve"
export type MezoGaugeNetwork = "base" | "ethereum"

export type GeckoTerminalNetwork = "base" | "eth"
export type DexScreenerChain = "base" | "ethereum"

export type MezoGaugeIdentity = {
  name: string
  protocol: MezoGaugeProtocol
  network: MezoGaugeNetwork
  tokens: [string, ...string[]]
  protocolUrl: string
  poolUrl: string
  action: string
  distributionEpochOffset: number
  geckoPoolId: string
}

const WEEK_SECONDS = 604_800
const WEEK_MS = WEEK_SECONDS * 1_000

/**
 * Official remote MEZO gauges, keyed by checksummed gauge address.
 * Catalog is the enumeration source — do not read voter.length / gauges(i).
 */
export const MEZO_GAUGES: Record<Address, MezoGaugeIdentity> = {
  [getAddress("0xC7e81dd77A4624F0DD14A8bB97Bc721b0CEE6e26")]: {
    name: "USDC/MUSD",
    protocol: "Aerodrome",
    network: "base",
    tokens: ["USDC", "MUSD"],
    protocolUrl: "https://aerodrome.finance",
    poolUrl:
      "https://aerodrome.finance/vote?filters=all&query=0xFF56D037D948faD1027a1AC82ae610e4b694c641",
    action: "Incentivize voters on this Aerodrome gauge",
    distributionEpochOffset: 1,
    geckoPoolId: "0xFF56D037D948faD1027a1AC82ae610e4b694c641",
  },
  [getAddress("0x4440A9b2954cB98416C0122e2ea996C46555F4B6")]: {
    name: "MEZO/MUSD",
    protocol: "Aerodrome",
    network: "base",
    tokens: ["MEZO", "MUSD"],
    protocolUrl: "https://aerodrome.finance",
    poolUrl:
      "https://aerodrome.finance/vote?filters=all&query=0xEF458A3263d2a8C7f3ed9e949aE2F9B345D08b1F",
    action: "Incentivize voters on this Aerodrome gauge",
    distributionEpochOffset: 1,
    geckoPoolId: "0xEF458A3263d2a8C7f3ed9e949aE2F9B345D08b1F",
  },
  [getAddress("0x2ced96e759ab481210d41c567eee5c42edb59a1d")]: {
    name: "MUSD/USDC",
    protocol: "Uniswap v4",
    network: "ethereum",
    tokens: ["MUSD", "USDC"],
    protocolUrl: "https://app.uniswap.org/",
    poolUrl:
      "https://app.uniswap.org/explore/pools/ethereum/0xa9bf5691768ef950a99efd74d722961ff2df3fec08d77ec784432c619bd283a0",
    action: "Incentivize liquidity providers on this pool gauge through Merkl",
    distributionEpochOffset: 1,
    geckoPoolId:
      "0xa9bf5691768ef950a99efd74d722961ff2df3fec08d77ec784432c619bd283a0",
  },
  [getAddress("0xc39a294024dca62f579c49d7c83a6c831d4976d0")]: {
    name: "MUSD/USDC/USDT",
    protocol: "Curve",
    network: "ethereum",
    tokens: ["MUSD", "USDC", "USDT"],
    protocolUrl: "https://www.curve.finance/",
    poolUrl:
      "https://www.curve.finance/dex/ethereum/pools/0xb5571e76693ba60110b5811dd650ffefce1c955f",
    action: "Incentivize liquidity providers on this pool gauge through Merkl",
    distributionEpochOffset: 1,
    geckoPoolId: "0xb5571e76693ba60110b5811dd650ffefce1c955f",
  },
}

export function mezoGaugeAddresses(): Address[] {
  return Object.keys(MEZO_GAUGES).map((address) => getAddress(address))
}

export function mezoGaugeIdentity(
  gauge: Address,
): MezoGaugeIdentity | undefined {
  try {
    return MEZO_GAUGES[getAddress(gauge)]
  } catch {
    return undefined
  }
}

export function mezoVenueTokenIconSymbol(symbol: string): string {
  if (symbol === "USDC") return "mUSDC"
  if (symbol === "USDT") return "mUSDT"
  return symbol
}

export function mezoVenueTokenIconSymbols(tokens: readonly string[]): string[] {
  return tokens.map(mezoVenueTokenIconSymbol)
}

export function geckoNetworkFor(
  network: MezoGaugeNetwork,
): GeckoTerminalNetwork {
  return network === "base" ? "base" : "eth"
}

export function dexScreenerChainFor(
  network: MezoGaugeNetwork,
): DexScreenerChain {
  return network === "base" ? "base" : "ethereum"
}

export type MezoGaugeVenueLookup = {
  gauge: Address
  protocol: MezoGaugeProtocol
  geckoNetwork: GeckoTerminalNetwork
  geckoPoolId: string
  dexScreenerChain: DexScreenerChain
}

export function mezoGaugeVenueLookups(): MezoGaugeVenueLookup[] {
  return Object.entries(MEZO_GAUGES).map(([gauge, identity]) => ({
    gauge: getAddress(gauge),
    protocol: identity.protocol,
    geckoNetwork: geckoNetworkFor(identity.network),
    geckoPoolId: identity.geckoPoolId,
    dexScreenerChain: dexScreenerChainFor(identity.network),
  }))
}

export type MezoGaugeOnChainItem = {
  gauge: Address
  isAlive: boolean
}

export type MezoGaugeRow<
  T extends MezoGaugeOnChainItem = MezoGaugeOnChainItem,
> = T & {
  identity: MezoGaugeIdentity
}

export function resolveMezoGaugeRows<T extends MezoGaugeOnChainItem>(
  items: readonly T[],
): MezoGaugeRow<T>[] {
  return items
    .filter((item) => item.isAlive)
    .flatMap((item) => {
      try {
        const gauge = getAddress(item.gauge)
        const identity = MEZO_GAUGES[gauge]
        if (!identity) return []
        return [{ ...item, gauge, identity }]
      } catch {
        return []
      }
    })
    .sort((a, b) => {
      const byName = a.identity.name.localeCompare(b.identity.name)
      if (byName !== 0) return byName
      return a.gauge.localeCompare(b.gauge)
    })
}

export function resolveDistributionDate(
  voteEpochEnd: Date,
  epochOffset: number,
): Date {
  return new Date(voteEpochEnd.getTime() + epochOffset * WEEK_MS)
}

export function formatDistributionDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  })
}
