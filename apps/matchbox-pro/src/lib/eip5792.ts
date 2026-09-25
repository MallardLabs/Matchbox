import type { Address } from "viem"

type WalletClientWithCapabilities = {
  getCapabilities?: (parameters: {
    account?: Address
    chainId?: number
  }) => Promise<unknown>
}

// EIP-5792: a wallet advertising atomic "supported" or "ready" can take a
// multi-call bundle in one signature.
export default async function supportsAtomicBatch(
  walletClient: WalletClientWithCapabilities,
  account: Address,
  chainId: number,
): Promise<boolean> {
  if (!walletClient.getCapabilities) return false
  try {
    const capabilities = (await walletClient.getCapabilities({
      account,
      chainId,
    })) as { atomic?: { status?: string } } | null
    const status = capabilities?.atomic?.status
    return status === "supported" || status === "ready"
  } catch {
    return false
  }
}
