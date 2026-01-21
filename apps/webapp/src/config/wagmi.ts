import { CHAIN_ID } from "@repo/shared/contracts"
import { defineChain } from "viem"
import { http, type Config, createConfig } from "wagmi"
import { injected } from "wagmi/connectors"

export const mezoMainnet = defineChain({
  id: CHAIN_ID.mainnet,
  name: "Mezo Mainnet",
  nativeCurrency: {
    decimals: 18,
    name: "Bitcoin",
    symbol: "BTC",
  },
  rpcUrls: {
    default: {
      http: ["https://rpc-http.mezo.boar.network"],
    },
  },
  blockExplorers: {
    default: {
      name: "Mezo Explorer",
      url: "https://explorer.mezo.org",
    },
  },
})

export const mezoTestnet = defineChain({
  id: CHAIN_ID.testnet,
  name: "Mezo Testnet",
  nativeCurrency: {
    decimals: 18,
    name: "Bitcoin",
    symbol: "BTC",
  },
  rpcUrls: {
    default: {
      http: ["https://rpc.test.mezo.org"],
    },
  },
  blockExplorers: {
    default: {
      name: "Mezo Explorer",
      url: "https://explorer.test.mezo.org",
    },
  },
})

export const wagmiConfig: Config = createConfig({
  chains: [mezoMainnet, mezoTestnet],
  connectors: [injected()],
  transports: {
    [mezoMainnet.id]: http(),
    [mezoTestnet.id]: http(),
  },
})
