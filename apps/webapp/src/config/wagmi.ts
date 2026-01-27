import { getDefaultWallets, mezoMainnet, mezoTestnet } from "@mezo-org/passport"
import { getDefaultConfig } from "@rainbow-me/rainbowkit"
import { http, type Config } from "wagmi"

export { mezoMainnet, mezoTestnet }

// WalletConnect Project ID - get one at https://cloud.walletconnect.com
const WALLET_CONNECT_PROJECT_ID =
  process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID ||
  "3fcc6bba6f1de962d911bb5b5c3dba68"

// Get Bitcoin wallet connectors from Passport
// Using testnet config as the default - network switching is handled by wagmi chains
const defaultWallets = getDefaultWallets("testnet")

// Extract wallet groups safely
const bitcoinWalletGroup = defaultWallets.find(
  (group) => group.groupName === "Bitcoin",
)
const ethereumWalletGroup = defaultWallets.find(
  (group) => group.groupName === "Ethereum",
)

// Wallet groups for the connect modal
const wallets = [
  ...(bitcoinWalletGroup ? [bitcoinWalletGroup] : []),
  ...(ethereumWalletGroup ? [ethereumWalletGroup] : []),
]

export const wagmiConfig: Config = getDefaultConfig({
  appName: "Matchbox",
  appDescription: "Mezo Gauge Voting & veMEZO Management",
  projectId: WALLET_CONNECT_PROJECT_ID,
  chains: [mezoTestnet, mezoMainnet],
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
