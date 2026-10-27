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
import { lazyBitcoinWallet } from "./bitcoinWallets"
import { deferredWallet } from "./deferredConnectors"
import {
  mezoMainnet as passportMezoMainnet,
  mezoTestnet as passportMezoTestnet,
} from "./mezoChains"
import { mezoTransport } from "./rpcWrite"

const WALLET_CONNECT_PROJECT_ID =
  import.meta.env.VITE_WALLET_CONNECT_PROJECT_ID ?? ""
const hasWalletConnect = WALLET_CONNECT_PROJECT_ID.length >= 32

/**
 * Without a project id WalletConnect can't pair, so the picker offers
 * downloads in place of WalletConnect wallets (see ./wallets).
 */
export const walletConnectEnabled = hasWalletConnect

const MAINNET_RPC = "https://rpc-internal.mezo.org"
const TESTNET_RPC =
  import.meta.env.VITE_RPC_TESTNET_URL ?? "https://rpc.test.mezo.org"

// rpc-internal answers HTTP 413 past ~20 calls per JSON-RPC batch or ~4 KB
// of calldata per multicall (see worker/history/chain.ts).
const MULTICALL_BATCH_SIZE_BYTES = 4_096
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

// OrangeKit's connector code loads on demand (see ./bitcoinWallets).
const bitcoinWallets = [
  lazyBitcoinWallet("unisat", {
    rpcUrl: MAINNET_RPC,
    chainId: mezoMainnet.id,
  }),
  lazyBitcoinWallet("okx", {
    rpcUrl: MAINNET_RPC,
    chainId: mezoMainnet.id,
  }),
  lazyBitcoinWallet("xverse", {
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
  // SDK-backed connectors stay asleep until used (see ./deferredConnectors).
  { groupName: "Ethereum", wallets: ethereumWallets.map(deferredWallet) },
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
    [mezoMainnet.id]: mezoTransport(MAINNET_RPC, JSON_RPC_BATCH_SIZE),
    [mezoTestnet.id]: mezoTransport(TESTNET_RPC, JSON_RPC_BATCH_SIZE),
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
