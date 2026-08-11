import { connectorsForWallets, getDefaultConfig } from "@rainbow-me/rainbowkit"
import { injectedWallet } from "@rainbow-me/rainbowkit/wallets"
import { http, defineChain } from "viem"
import { mainnet } from "viem/chains"
import { type Config, createConfig } from "wagmi"

export const mezoMainnet = defineChain({
  id: 31_612,
  name: "Mezo Mainnet",
  nativeCurrency: { decimals: 18, name: "Bitcoin", symbol: "BTC" },
  rpcUrls: {
    default: { http: ["https://mezo-mainnet.boar.network"] },
  },
})

const appName = "Matchbox Pro"
const appDescription = "Search Mezo and prepare actions with Stuart Query"
const chains = [mezoMainnet, mainnet] as const
const transports = {
  [mezoMainnet.id]: http(mezoMainnet.rpcUrls.default.http[0]),
  [mainnet.id]: http("https://cloudflare-eth.com"),
}

function createWalletConfig(): Config {
  const walletConnectProjectId =
    process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID?.trim()

  if (walletConnectProjectId) {
    return getDefaultConfig({
      appName,
      appDescription,
      projectId: walletConnectProjectId,
      chains,
      transports,
      ssr: true,
    })
  }

  const connectors = connectorsForWallets(
    [{ groupName: "Browser", wallets: [injectedWallet] }],
    {
      appName,
      appDescription,
      projectId: "injected-only",
    },
  )
  return createConfig({ chains, connectors, transports, ssr: true })
}

export const wagmiConfig = createWalletConfig()
