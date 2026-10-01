import { z } from "zod"

export const networkSchema = z.enum(["mezo", "mezo-testnet"])

export type Network = z.output<typeof networkSchema>

export type RpcEndpoint = {
  url: string
  // eth_getLogs limits measured against each provider (docs/goldsky-exit.md).
  maxAddresses: number
  maxBlockRange: number
}

export type NetworkConfig = {
  network: Network
  chainId: number
  // First block the indexer ingests. Covers the Legacy* reward contracts
  // (~5.23M) and the PoolFactory's first PoolCreated (~5.05M).
  startBlock: bigint
  // Mezo is CometBFT (instant finality, unverified). Stay this far behind head.
  confirmations: bigint
  windowSize: bigint
  endpoints: RpcEndpoint[]
}

const MEZO_WINDOW = 10_000n

export const NETWORKS: Record<Network, NetworkConfig | undefined> = {
  mezo: {
    network: "mezo",
    chainId: 31612,
    startBlock: 5_000_000n,
    confirmations: 2n,
    windowSize: MEZO_WINDOW,
    endpoints: [
      {
        url: "https://rpc-internal.mezo.org",
        maxAddresses: 100,
        maxBlockRange: 10_000,
      },
      {
        url: "https://mainnet.mezo.public.validationcloud.io",
        maxAddresses: 30,
        maxBlockRange: 10_000,
      },
      {
        url: "https://rpc-http.mezo.boar.network",
        maxAddresses: 100,
        maxBlockRange: 10_000,
      },
    ],
  },
  // Testnet waits until its contract set and RPC limits are measured.
  "mezo-testnet": undefined,
}

export function networkConfig(network: Network): NetworkConfig {
  const config = NETWORKS[network]
  if (!config) {
    throw new Error(`Network ${network} is not configured for ingest`)
  }
  return config
}
