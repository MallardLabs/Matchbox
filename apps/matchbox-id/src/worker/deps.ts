import type { Logger } from "@repo/logger"
import type { NetworkSlug } from "@repo/platform-contracts/network"
import type { RateLimitClient } from "@repo/platform-server"
import type { IdFlags } from "./config"
import type { SigningKeys } from "./oidc/keys"
import type { IdStore } from "./store/id-store"

export type ContractSignatureArgs = {
  message: string
  signature: `0x${string}`
  address: `0x${string}`
}

/**
 * One RPC's word on a contract-account signature (see rpcSignatureClient).
 * `isValidSignature` resolves only on the chain's answer and throws when the
 * RPC gave none (HTTP error, timeout).
 */
export type SiwePublicClient = {
  getChainId(): Promise<number>
  isValidSignature(args: ContractSignatureArgs): Promise<boolean>
}

export type IdConfig = {
  /** `https://id.matchbox.markets` (no trailing slash). */
  issuer: string
  sessionPepper: string
  clientSecretPepper: string
}

/** Everything `createApp` needs; tests pass memory/fake implementations. */
export type AppDeps = {
  store: IdStore
  rateLimits: RateLimitClient
  keys: SigningKeys
  now: () => Date
  flags: IdFlags
  config: IdConfig
  /** One client per independent RPC of the network, primary first. */
  publicClientsFor: (network: NetworkSlug) => SiwePublicClient[]
  logger?: Logger
}
