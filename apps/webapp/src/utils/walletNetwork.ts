import { CHAIN_ID } from "@repo/shared/contracts"

const CHAIN_LABELS: Record<number, string> = {
  [CHAIN_ID.mainnet]: "Mezo Mainnet",
  [CHAIN_ID.testnet]: "Mezo Testnet",
  1: "Ethereum",
}

export function getChainLabel(chainId: number): string {
  return CHAIN_LABELS[chainId] ?? `Chain ${chainId}`
}

export function formatWrongNetwork(
  walletChainId: number,
  expectedChainId: number,
): string {
  return `Wallet on ${getChainLabel(walletChainId)}, expected ${getChainLabel(expectedChainId)}`
}

export class WrongNetworkError extends Error {
  readonly walletChainId: number
  readonly expectedChainId: number

  constructor(walletChainId: number, expectedChainId: number) {
    super(formatWrongNetwork(walletChainId, expectedChainId))
    this.name = "WrongNetworkError"
    this.walletChainId = walletChainId
    this.expectedChainId = expectedChainId
  }
}

export function isWrongWalletNetwork(
  walletChainId: number | undefined,
  expectedChainId: number,
): boolean {
  return walletChainId !== undefined && walletChainId !== expectedChainId
}

/**
 * Throws before a signing request when the wallet sits on another chain. An
 * unknown wallet chain (no connector) passes: the write itself then fails as
 * not connected.
 */
export function assertWalletChain(
  walletChainId: number | undefined,
  expectedChainId: number,
): void {
  if (walletChainId !== undefined && walletChainId !== expectedChainId) {
    throw new WrongNetworkError(walletChainId, expectedChainId)
  }
}
