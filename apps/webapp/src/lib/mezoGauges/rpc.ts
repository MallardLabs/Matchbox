import { MEZO_MAINNET_SERVER_RPC_ENDPOINTS } from "@/config/mezoRpc"
import { CHAIN_ID } from "@repo/shared/contracts"
import {
  http,
  type PublicClient,
  createPublicClient,
  defineChain,
  fallback,
} from "viem"

export const MEZO_GAUGES_CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
} as const

const boarRpc = MEZO_MAINNET_SERVER_RPC_ENDPOINTS.find(
  (endpoint) => endpoint.id === "boar",
)
const internalRpc = MEZO_MAINNET_SERVER_RPC_ENDPOINTS.find(
  (endpoint) => endpoint.id === "internal",
)
const primaryRpcUrl =
  process.env.MEZO_RPC_URL ??
  boarRpc?.url ??
  MEZO_MAINNET_SERVER_RPC_ENDPOINTS[0].url
const rpcUrls = [...new Set([primaryRpcUrl, internalRpc?.url ?? primaryRpcUrl])]

const mezoMainnet = defineChain({
  id: CHAIN_ID.mainnet,
  name: "Mezo Mainnet",
  nativeCurrency: { name: "Bitcoin", symbol: "BTC", decimals: 18 },
  rpcUrls: {
    default: {
      http: rpcUrls,
    },
  },
})

export function createMezoMainnetClient(): PublicClient {
  // Boar can return 429s from shared Workers egress when the dashboard loads
  // snapshot and history together. Retry failed reads through the internal RPC.
  return createPublicClient({
    chain: mezoMainnet,
    transport: fallback(
      rpcUrls.map((url) => http(url)),
      { retryCount: 0 },
    ),
  })
}
