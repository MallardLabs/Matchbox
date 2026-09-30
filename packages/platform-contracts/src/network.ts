import { z } from "zod"

export const networkSlugSchema = z.enum(["mezo", "mezo-testnet"])

export type NetworkSlug = z.infer<typeof networkSlugSchema>

export const environmentKindSchema = z.enum(["test", "live"])

export type EnvironmentKind = z.infer<typeof environmentKindSchema>

export const chainIdByNetwork = {
  mezo: 31612,
  "mezo-testnet": 31611,
} as const satisfies Record<NetworkSlug, number>

export type MezoChainId = (typeof chainIdByNetwork)[NetworkSlug]

export const chainIdSchema = z.union([z.literal(31612), z.literal(31611)])

export const networkByEnvironmentKind = {
  test: "mezo-testnet",
  live: "mezo",
} as const satisfies Record<EnvironmentKind, NetworkSlug>

export const environmentKindByNetwork = {
  mezo: "live",
  "mezo-testnet": "test",
} as const satisfies Record<NetworkSlug, EnvironmentKind>

export const networkNames = {
  mezo: "Mezo",
  "mezo-testnet": "Mezo Testnet",
} as const satisfies Record<NetworkSlug, string>

export const networkSchema = z.object({
  slug: networkSlugSchema,
  chainId: chainIdSchema,
  name: z.string(),
  environmentKind: environmentKindSchema,
})

export type Network = z.infer<typeof networkSchema>

export function networkForEnvironmentKind(kind: EnvironmentKind): NetworkSlug {
  return networkByEnvironmentKind[kind]
}

export function environmentKindForNetwork(
  network: NetworkSlug,
): EnvironmentKind {
  return environmentKindByNetwork[network]
}

export function chainIdForNetwork(network: NetworkSlug): MezoChainId {
  return chainIdByNetwork[network]
}

export function networkForChainId(chainId: number): NetworkSlug | null {
  if (chainId === chainIdByNetwork.mezo) return "mezo"
  if (chainId === chainIdByNetwork["mezo-testnet"]) return "mezo-testnet"
  return null
}

export function describeNetwork(network: NetworkSlug): Network {
  return {
    slug: network,
    chainId: chainIdByNetwork[network],
    name: networkNames[network],
    environmentKind: environmentKindByNetwork[network],
  }
}

/** Test environments read Mezo testnet only; live reads Mezo mainnet only. */
export function isNetworkAllowedForEnvironment(
  kind: EnvironmentKind,
  network: NetworkSlug,
): boolean {
  return networkByEnvironmentKind[kind] === network
}
