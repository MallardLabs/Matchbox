// Deep imports: the passport barrel drags in its whole UI kit (mezo-clay) and
// API clients, while the app only needs these orangekit re-exports.
import {
  mezoMainnet as passportMezoMainnet,
  mezoTestnet as passportMezoTestnet,
} from "@mezo-org/passport/dist/src/constants.js"
import {
  getOKXWallet,
  getUnisatWallet,
  getXverseWallet,
} from "@mezo-org/passport/dist/src/wallet/index.js"
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

const WALLET_CONNECT_PROJECT_ID =
  import.meta.env.VITE_WALLET_CONNECT_PROJECT_ID ?? ""
const hasWalletConnect = WALLET_CONNECT_PROJECT_ID.length >= 32

const MAINNET_RPC = "https://rpc-internal.mezo.org"
const TESTNET_RPC =
  import.meta.env.VITE_RPC_TESTNET_URL ?? "https://rpc.test.mezo.org"

const MULTICALL_BATCH_SIZE_BYTES = 16_384
const JSON_RPC_BATCH_SIZE = 20

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

export const mezoMainnet = withHttpRpc(passportMezoMainnet, MAINNET_RPC)
const mezoTestnet = withHttpRpc(passportMezoTestnet, TESTNET_RPC)

const bitcoinWallets = [
  getUnisatWallet({
    rpcUrl: MAINNET_RPC,
    chainId: mezoMainnet.id,
  }),
  getOKXWallet({
    rpcUrl: MAINNET_RPC,
    chainId: mezoMainnet.id,
  }),
  getXverseWallet({
    rpcUrl: MAINNET_RPC,
    chainId: mezoMainnet.id,
  }),
] as const

const ethereumWallets = [
  tahoWallet,
  metaMaskWallet,
  zerionWallet,
  rabbyWallet,
  bitgetWallet,
  coinbaseWallet,
  trustWallet,
  okxWallet,
  injectedWallet,
  ...(hasWalletConnect ? [walletConnectWallet] : []),
]

const defaultWallets: WalletList = [
  { groupName: "Bitcoin", wallets: [...bitcoinWallets] },
  { groupName: "Ethereum", wallets: ethereumWallets },
]

export const wagmiConfig: Config = getDefaultConfig({
  appName: "Matchbox Pro",
  appDescription: "Matchbox Pro Preview",
  projectId: hasWalletConnect
    ? WALLET_CONNECT_PROJECT_ID
    : "00000000000000000000000000000000",
  chains: [mezoTestnet, mezoMainnet, mainnet],
  batch: {
    multicall: {
      batchSize: MULTICALL_BATCH_SIZE_BYTES,
    },
  },
  transports: {
    [mezoMainnet.id]: http(MAINNET_RPC, {
      batch: { batchSize: JSON_RPC_BATCH_SIZE },
      fetchOptions: { cache: "no-store" },
    }),
    [mezoTestnet.id]: http(TESTNET_RPC, {
      batch: { batchSize: JSON_RPC_BATCH_SIZE },
      fetchOptions: { cache: "no-store" },
    }),
    [mainnet.id]: http("https://cloudflare-eth.com", {
      batch: { batchSize: JSON_RPC_BATCH_SIZE },
      fetchOptions: { cache: "no-store" },
    }),
  },
  wallets: defaultWallets,
  walletConnectParameters: {
    qrModalOptions: {
      explorerRecommendedWalletIds: "NONE",
    },
  },
  multiInjectedProviderDiscovery: true,
  ssr: false,
})
