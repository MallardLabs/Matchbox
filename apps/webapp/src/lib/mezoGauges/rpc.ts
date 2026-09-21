import { MEZO_MAINNET_SERVER_RPC_ENDPOINTS } from "@/config/mezoRpc"
import { CHAIN_ID } from "@repo/shared/contracts"
import { http, type PublicClient, createPublicClient, defineChain } from "viem"

export const MEZO_GAUGES_CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
} as const

const boarRpc = MEZO_MAINNET_SERVER_RPC_ENDPOINTS.find(
  (endpoint) => endpoint.id === "boar",
)

const mezoMainnet = defineChain({
  id: CHAIN_ID.mainnet,
  name: "Mezo Mainnet",
  nativeCurrency: { name: "Bitcoin", symbol: "BTC", decimals: 18 },
  rpcUrls: {
    default: {
      http: [
        process.env.MEZO_RPC_URL ??
          boarRpc?.url ??
          MEZO_MAINNET_SERVER_RPC_ENDPOINTS[0].url,
      ],
    },
  },
})

export function createMezoMainnetClient(): PublicClient {
  return createPublicClient({ chain: mezoMainnet, transport: http() })
}
