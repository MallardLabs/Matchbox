import {
  DEFAULT_MEZO_TESTNET_RPC_URL,
  getInitialMezoMainnetRpcUrl,
} from "@/config/mezoRpc"
import { createMezoMainnetTransport } from "@/config/mezoRpcTransport"
import {
  getOKXWallet,
  getUnisatWallet,
  getXverseWallet,
  mezoMainnet as passportMezoMainnet,
  mezoTestnet as passportMezoTestnet,
} from "@mezo-org/passport"
import { type WalletList, getDefaultConfig } from "@rainbow-me/rainbowkit"
import {
  bitgetWallet,
  coinbaseWallet,
  injectedWallet,
  metaMaskWallet,
  okxWallet,
  rabbyWallet,
  tahoWallet,
  trustWallet,
  walletConnectWallet,
  zerionWallet,
} from "@rainbow-me/rainbowkit/wallets"
import { mainnet } from "viem/chains"
import { http, type Config } from "wagmi"

/** EVM wallets shown in the connect wallet drawer (order preserved; WC + injected sorted last in UI). */
const ethereumWalletConnectors = [
  tahoWallet,
  metaMaskWallet,
  zerionWallet,
  rabbyWallet,
  bitgetWallet,
  coinbaseWallet,
  trustWallet,
  okxWallet,
  injectedWallet,
  walletConnectWallet,
] as const

export { mezoMainnet, mezoTestnet }

// WalletConnect Project ID - get one at https://cloud.walletconnect.com
const WALLET_CONNECT_PROJECT_ID =
  process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID ?? ""

const MEZO_MAINNET_RPC_URL = getInitialMezoMainnetRpcUrl()
const MEZO_TESTNET_RPC_URL = DEFAULT_MEZO_TESTNET_RPC_URL

function withHttpRpc(
  chain: typeof passportMezoMainnet,
  rpcUrl: string,
): typeof passportMezoMainnet {
  return {
    ...chain,
    rpcUrls: {
      ...chain.rpcUrls,
      default: {
        ...chain.rpcUrls.default,
        http: [rpcUrl],
      },
      public: {
        ...chain.rpcUrls.public,
        http: [rpcUrl],
      },
    },
  }
}

const mezoMainnet = withHttpRpc(passportMezoMainnet, MEZO_MAINNET_RPC_URL)
const mezoTestnet = withHttpRpc(passportMezoTestnet, MEZO_TESTNET_RPC_URL)

// Build Bitcoin wallet connectors explicitly so OrangeKit uses the public Mezo RPC
// instead of Passport's baked-in internal endpoint for mainnet.
const bitcoinWalletConnectors = [
  getUnisatWallet({
    rpcUrl: MEZO_MAINNET_RPC_URL,
    chainId: mezoMainnet.id,
  }),
  getOKXWallet({
    rpcUrl: MEZO_MAINNET_RPC_URL,
    chainId: mezoMainnet.id,
  }),
  getXverseWallet({
    rpcUrl: MEZO_MAINNET_RPC_URL,
    chainId: mezoMainnet.id,
  }),
] as const

export const defaultWallets: WalletList = [
  {
    groupName: "Bitcoin",
    wallets: [...bitcoinWalletConnectors],
  },
  {
    groupName: "Ethereum",
    wallets: [...ethereumWalletConnectors],
  },
]

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
  // Include Ethereum mainnet so WalletConnect / AppKit can list wallets that only register
  // support for eip155:1. Mezo-only sessions hide most of the directory; connection still
  // targets the selected Mezo chain via ConnectWalletDrawer + switch after connect.
  chains: [mezoTestnet, mezoMainnet, mainnet],
  transports: {
    [mezoMainnet.id]: createMezoMainnetTransport(),
    [mezoTestnet.id]: http(MEZO_TESTNET_RPC_URL, {
      batch: true,
      fetchOptions: { cache: "no-store" },
    }),
    // viem's built-in Ethereum mainnet chain defaults to Merkle, which does not
    // send CORS headers for browser requests. Keep mainnet available for wallet
    // compatibility, but route it through a browser-safe public RPC instead.
    [mainnet.id]: http("https://cloudflare-eth.com", {
      batch: true,
      fetchOptions: { cache: "no-store" },
    }),
  },
  wallets,
  walletConnectParameters: {
    qrModalOptions: {
      explorerRecommendedWalletIds: "NONE",
    },
  },
  multiInjectedProviderDiscovery: true,
  ssr: true,
})
