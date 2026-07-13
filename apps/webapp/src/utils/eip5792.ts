import type { Address } from "viem"

export type AtomicBatchStatus = "supported" | "ready" | "unsupported" | null
export type WalletBatchSupportReason =
  | "supported"
  | "wallet-not-connected"
  | "atomic-unsupported"
  | "capabilities-unavailable"
  | "capabilities-error"

export type AtomicBatchSupport = {
  atomicStatus: AtomicBatchStatus
  supportsAtomicBatching: boolean
  reason: WalletBatchSupportReason
  errorMessage?: string
}

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
}): Promise<AtomicBatchSupport> {
  if (!walletClient?.getCapabilities || !account) {
    return {
      atomicStatus: null,
      supportsAtomicBatching: false,
      reason: account ? "capabilities-unavailable" : "wallet-not-connected",
    }
  }

  try {
    const capabilities = (await walletClient.getCapabilities({
      account,
      chainId,
    })) as WalletBatchCapabilities
    const atomicStatus = capabilities.atomic?.status ?? null
    const supportsAtomicBatching =
      atomicStatus === "supported" || atomicStatus === "ready"

    console.info("[EIP-5792] Wallet capabilities checked", {
      account,
      atomicStatus,
      capabilities,
      chainId,
      supportsAtomicBatching,
    })

    return {
      atomicStatus,
      supportsAtomicBatching,
      reason: supportsAtomicBatching
        ? "supported"
        : atomicStatus === "unsupported"
          ? "atomic-unsupported"
          : "capabilities-unavailable",
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown wallet capability error"

    console.warn("[EIP-5792] Failed to read wallet capabilities", {
      account,
      chainId,
      error,
    })

    return {
      atomicStatus: null,
      supportsAtomicBatching: false,
      reason: "capabilities-error",
      errorMessage,
    }
  }
}
