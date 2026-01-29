import { getDefaultWallets, mezoMainnet, mezoTestnet } from "@mezo-org/passport"
import { getDefaultConfig, type WalletList } from "@rainbow-me/rainbowkit"
import {
  injectedWallet,
  rabbyWallet,
  tahoWallet,
} from "@rainbow-me/rainbowkit/wallets"
import { http, type Config } from "wagmi"

export { mezoMainnet, mezoTestnet }

// WalletConnect Project ID - get one at https://cloud.walletconnect.com
const WALLET_CONNECT_PROJECT_ID =
  process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID ?? ""

// Get Bitcoin wallet connectors from Passport
// Using mainnet config - matches production Bitcoin wallets
const rawDefaultWallets = getDefaultWallets("mainnet")

export const defaultWallets = rawDefaultWallets.map((group) => {
  if (group.groupName === "Ethereum") {
    return {
      ...group,
      wallets: [...group.wallets, tahoWallet, rabbyWallet, injectedWallet],
    }
  }
  return group
})

// Extract wallet groups safely
const bitcoinWalletGroup = defaultWallets.find(
  (group) => group.groupName === "Bitcoin",
)
const ethereumWalletGroup = defaultWallets.find(
  (group) => group.groupName === "Ethereum",
)

// Wallet groups for the connect modal
const wallets: WalletList = [
  ...(bitcoinWalletGroup ? [bitcoinWalletGroup] : []),
  ...(ethereumWalletGroup ? [ethereumWalletGroup] : []),
]

export const wagmiConfig: Config = getDefaultConfig({
  appName: "Matchbox",
  appDescription: "Mezo Gauge Voting & veMEZO Management",
  projectId: WALLET_CONNECT_PROJECT_ID,
  chains: [mezoMainnet, mezoTestnet],
  transports: {
    [mezoMainnet.id]: http(undefined, {
      batch: true,
      fetchOptions: { cache: "no-store" },
    }),
    [mezoTestnet.id]: http(undefined, {
      batch: true,
      fetchOptions: { cache: "no-store" },
    }),
  },
  wallets,
  multiInjectedProviderDiscovery: true,
  ssr: true,
})
