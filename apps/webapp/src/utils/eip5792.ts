import type { Address } from "viem"

export type AtomicBatchStatus = "supported" | "ready" | "unsupported" | null

type WalletBatchCapabilities = {
  atomic?: {
    status?: AtomicBatchStatus
  }
}

type WalletClientWithCapabilities = {
  getCapabilities?: (parameters: {
    account?: Address
    chainId?: number
  }) => Promise<unknown>
}

export async function getAtomicBatchSupport({
  walletClient,
  account,
  chainId,
}: {
  walletClient: WalletClientWithCapabilities | null | undefined
  account: Address | undefined
  chainId: number
}): Promise<{
  atomicStatus: AtomicBatchStatus
  supportsAtomicBatching: boolean
}> {
  if (!walletClient?.getCapabilities || !account) {
    return {
      atomicStatus: null,
      supportsAtomicBatching: false,
    }
  }

  try {
    const capabilities = (await walletClient.getCapabilities({
      account,
      chainId,
    })) as WalletBatchCapabilities
    const atomicStatus = capabilities.atomic?.status ?? null

    return {
      atomicStatus,
      supportsAtomicBatching:
        atomicStatus === "supported" || atomicStatus === "ready",
    }
  } catch {
    return {
      atomicStatus: null,
      supportsAtomicBatching: false,
    }
  }
}
