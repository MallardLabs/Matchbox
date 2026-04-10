import { CHAIN_ID, type SupportedChainId } from "@repo/shared/contracts"
import type { Address, Hash } from "viem"

const MEZO_MAINNET_EXPLORER_URL =
  process.env.NEXT_PUBLIC_EXPLORER_MAINNET_URL ?? "https://explorer.mezo.org"
const MEZO_TESTNET_EXPLORER_URL =
  process.env.NEXT_PUBLIC_EXPLORER_TESTNET_URL ??
  "https://explorer.test.mezo.org"

const EXPLORER_URLS: Record<SupportedChainId, string> = {
  [CHAIN_ID.mainnet]: MEZO_MAINNET_EXPLORER_URL,
  [CHAIN_ID.testnet]: MEZO_TESTNET_EXPLORER_URL,
}

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/$/, "")
}

export function getExplorerBaseUrl(chainId: SupportedChainId): string {
  return normalizeBaseUrl(EXPLORER_URLS[chainId])
}

export function getExplorerAddressUrl(
  chainId: SupportedChainId,
  address: Address,
): string {
  return `${getExplorerBaseUrl(chainId)}/address/${address}`
}

export function getExplorerTransactionUrl(
  chainId: SupportedChainId,
  txHash: Hash,
): string {
  return `${getExplorerBaseUrl(chainId)}/tx/${txHash}`
}
