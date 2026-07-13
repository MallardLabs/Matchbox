import { useNetwork } from "@/contexts/NetworkContext"
import {
  type PendingSafeBatch,
  type SafeBatchCall,
  type SafeBatchItem,
  createPendingSafeBatch,
  createSafeTransactionBuilderFile,
  downloadSafeTransactionBuilderFile,
  verifySafeAccount,
  waitForSafeBatchExecution,
} from "@/utils/safeBatch"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { Hex, PublicClient } from "viem"
import { useAccount, usePublicClient } from "wagmi"

export type SafeBatchMonitorStatus =
  | "idle"
  | "monitoring"
  | "executed"
  | "error"

function storageKey(flow: string, chainId: number, address: string) {
  return `matchbox:safe-batch:${flow}:${chainId}:${address.toLowerCase()}`
}

export function useSafeBatchExport(flow: string) {
  const { chainId } = useNetwork()
  const { address, connector } = useAccount()
  const publicClient = usePublicClient({ chainId })
  const [isVerifiedSafe, setIsVerifiedSafe] = useState(false)
  const [isCheckingSafe, setIsCheckingSafe] = useState(false)
  const [pending, setPending] = useState<PendingSafeBatch | null>(null)
  const [status, setStatus] = useState<SafeBatchMonitorStatus>("idle")
  const [executedHash, setExecutedHash] = useState<Hex>()
  const [error, setError] = useState<Error>()
  const [copiedBatchJson, setCopiedBatchJson] = useState(false)
  const copyTimerRef = useRef<number>()

  const isWalletConnect = connector?.id === "walletConnect"
  const key = useMemo(
    () => (address ? storageKey(flow, chainId, address) : null),
    [address, chainId, flow],
  )

  useEffect(() => {
    let cancelled = false
    setIsVerifiedSafe(false)

    if (!isWalletConnect || !address || !publicClient) {
      setIsCheckingSafe(false)
      return
    }

    setIsCheckingSafe(true)
    void verifySafeAccount(publicClient as PublicClient, address).then(
      (verified) => {
        if (cancelled) return
        setIsVerifiedSafe(verified)
        setIsCheckingSafe(false)
      },
    )

    return () => {
      cancelled = true
    }
  }, [address, isWalletConnect, publicClient])

  useEffect(() => {
    if (!key) {
      setPending(null)
      setStatus("idle")
      return
    }

    const stored = window.localStorage.getItem(key)
    if (!stored) return

    try {
      const restored = JSON.parse(stored) as PendingSafeBatch
      setPending(restored)
      setStatus("monitoring")
    } catch {
      window.localStorage.removeItem(key)
    }
  }, [key])

  useEffect(() => {
    if (!pending || !publicClient || !key || status !== "monitoring") return

    const controller = new AbortController()
    void waitForSafeBatchExecution({
      publicClient: publicClient as PublicClient,
      pending,
      signal: controller.signal,
      onScannedBlock: (nextBlock) => {
        setPending((current) => {
          if (!current || current.id !== pending.id) return current
          const updated = { ...current, nextBlock: nextBlock.toString() }
          window.localStorage.setItem(key, JSON.stringify(updated))
          return updated
        })
      },
    }).then(
      (hash) => {
        window.localStorage.removeItem(key)
        setExecutedHash(hash)
        setStatus("executed")
      },
      (monitorError) => {
        if (controller.signal.aborted) return
        setError(
          monitorError instanceof Error
            ? monitorError
            : new Error(String(monitorError)),
        )
        setStatus("error")
      },
    )

    return () => controller.abort()
  }, [key, pending, publicClient, status])

  useEffect(() => {
    if (status !== "error" || !pending) return

    const retryTimer = window.setTimeout(() => {
      setError(undefined)
      setStatus("monitoring")
    }, 6_000)
    return () => window.clearTimeout(retryTimer)
  }, [pending, status])

  const exportBatch = useCallback(
    async ({
      name,
      description,
      calls,
      items,
    }: {
      name: string
      description: string
      calls: SafeBatchCall[]
      items: SafeBatchItem[]
    }) => {
      try {
        if (!address || !publicClient || !key || !isVerifiedSafe) {
          throw new Error(
            "Connect a verified Safe account through WalletConnect to export this batch.",
          )
        }
        if (calls.length < 2) {
          throw new Error("Safe batch export requires at least two actions.")
        }

        setError(undefined)
        const createdAt = Date.now()
        const fromBlock = await publicClient.getBlockNumber()
        const nextPending = createPendingSafeBatch({
          flow,
          chainId,
          safeAddress: address,
          fromBlock,
          calls,
          items,
          createdAt,
        })
        const batchFile = createSafeTransactionBuilderFile({
          chainId,
          safeAddress: address,
          name,
          description,
          calls,
          createdAt,
        })

        window.localStorage.setItem(key, JSON.stringify(nextPending))
        setPending(nextPending)
        setExecutedHash(undefined)
        setStatus("monitoring")
        downloadSafeTransactionBuilderFile(batchFile)
        return nextPending
      } catch (exportError) {
        setError(
          exportError instanceof Error
            ? exportError
            : new Error(String(exportError)),
        )
        return null
      }
    },
    [address, chainId, flow, isVerifiedSafe, key, publicClient],
  )

  const copyBatchJson = useCallback(
    async ({
      name,
      description,
      calls,
    }: {
      name: string
      description: string
      calls: SafeBatchCall[]
    }) => {
      try {
        if (!address)
          throw new Error("Connect a wallet to copy transaction JSON.")
        if (calls.length < 2) {
          throw new Error("Transaction JSON requires at least two actions.")
        }
        const batchFile = createSafeTransactionBuilderFile({
          chainId,
          safeAddress: address,
          name,
          description,
          calls,
        })
        await navigator.clipboard.writeText(JSON.stringify(batchFile, null, 2))
        setError(undefined)
        setCopiedBatchJson(true)
        if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current)
        copyTimerRef.current = window.setTimeout(
          () => setCopiedBatchJson(false),
          2_000,
        )
      } catch (copyError) {
        setError(
          copyError instanceof Error ? copyError : new Error(String(copyError)),
        )
      }
    },
    [address, chainId],
  )

  useEffect(
    () => () => {
      if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current)
    },
    [],
  )

  const clear = useCallback(() => {
    if (key) window.localStorage.removeItem(key)
    setPending(null)
    setStatus("idle")
    setExecutedHash(undefined)
    setError(undefined)
    setCopiedBatchJson(false)
  }, [key])

  return {
    canExportSafeBatch: isWalletConnect && isVerifiedSafe,
    canCopyBatchJson: Boolean(address),
    copiedBatchJson,
    isCheckingSafe,
    pending,
    status,
    executedHash,
    error,
    exportBatch,
    copyBatchJson,
    clear,
  }
}
