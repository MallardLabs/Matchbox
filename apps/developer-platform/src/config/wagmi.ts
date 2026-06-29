import { getDefaultConfig } from "@rainbow-me/rainbowkit"
import { http, defineChain } from "viem"
import { mainnet } from "viem/chains"

export const mezoMainnet = defineChain({
  id: 31612,
  name: "Mezo",
  nativeCurrency: { decimals: 18, name: "Bitcoin", symbol: "BTC" },
  rpcUrls: { default: { http: ["https://rpc-http.mezo.org"] } },
})

export const wagmiConfig = getDefaultConfig({
  appName: "Matchbox ID",
  appDescription: "Authorize apps with your Matchbox profile",
  projectId:
    process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID ??
    "00000000000000000000000000000000",
  chains: [mezoMainnet, mainnet],
  transports: {
    [mezoMainnet.id]: http("https://rpc-http.mezo.org"),
    [mainnet.id]: http("https://cloudflare-eth.com"),
  },
  ssr: true,
})
