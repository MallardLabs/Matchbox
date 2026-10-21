import { CHAIN_ID, type SupportedChainId } from "@repo/shared/contracts"
import { http, createPublicClient, fallback } from "viem"

const RPCS: Record<SupportedChainId, string[]> = {
  [CHAIN_ID.mainnet]: [
    "https://rpc-internal.mezo.org",
    "https://rpc-http.mezo.boar.network",
    "https://mainnet.mezo.public.validationcloud.io",
    "https://mezo.drpc.org",
  ],
  [CHAIN_ID.testnet]: ["https://rpc.test.mezo.org"],
}
// rpc-internal rejects JSON-RPC batches much past 20 calls (HTTP 413).
const RPC_BATCH_SIZE = 20

// viem queues JSON-RPC batches per URL for the whole isolate, so two
// requests could share one fetch, and Workers cancels a request that waits
// on another request's I/O (a bare 500). A per-client fragment, which fetch
// never sends, gives each client its own queue. Create clients per request.
let clientSequence = 0

export function isolatedRpcUrl(url: string): string {
  clientSequence += 1
  return `${url}#c${clientSequence}`
}

export default function createMezoClient(chainId: SupportedChainId) {
  const rpcs = RPCS[chainId]
  return createPublicClient({
    chain: {
      id: chainId,
      name: chainId === CHAIN_ID.mainnet ? "Mezo" : "Mezo Testnet",
      nativeCurrency: { decimals: 18, name: "Bitcoin", symbol: "BTC" },
      rpcUrls: { default: { http: rpcs } },
      contracts: {
        multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" },
      },
    },
    transport: fallback(
      rpcs.map((rpcUrl) =>
        http(isolatedRpcUrl(rpcUrl), {
          batch: { batchSize: RPC_BATCH_SIZE },
          fetchOptions: { cache: "no-store" },
          retryCount: 0,
        }),
      ),
    ),
  })
}
