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
        http(rpcUrl, {
          batch: true,
          fetchOptions: { cache: "no-store" },
          retryCount: 0,
        }),
      ),
    ),
  })
}
