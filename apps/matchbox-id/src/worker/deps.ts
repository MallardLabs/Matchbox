import type { Logger } from "@repo/logger"
import type { NetworkSlug } from "@repo/platform-contracts/network"
import type { RateLimitClient } from "@repo/platform-server"
import type { IdFlags } from "./config"
import type { SigningKeys } from "./oidc/keys"
import type { IdStore } from "./store/id-store"

/** The subset of a viem public client SIWE verification needs. */
export type SiwePublicClient = {
  verifySiweMessage(args: {
    message: string
    signature: `0x${string}`
    address: `0x${string}`
    domain: string
    nonce: string
    time: Date
  }): Promise<boolean>
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
  publicClientFactory: (network: NetworkSlug) => SiwePublicClient
  logger?: Logger
}
