import { useEffect, useState } from "react"
import { useBlockNumber } from "wagmi"

type RpcStatus = "connected" | "delayed" | "disconnected"

type RpcHealthResult = {
  status: RpcStatus
  lastBlockTime: number | null
  blockNumber: bigint | undefined
}

const DELAY_THRESHOLD_MS = 30000 // 30 seconds
const DISCONNECT_THRESHOLD_MS = 60000 // 60 seconds

export function useRpcHealth(): RpcHealthResult {
  const [lastSuccessTime, setLastSuccessTime] = useState<number | null>(null)
  const [status, setStatus] = useState<RpcStatus>("connected")

  const {
    data: blockNumber,
    isSuccess,
    isError,
  } = useBlockNumber({
    watch: true,
    query: {
      refetchInterval: 5000, // Poll every 5 seconds
    },
  })

  // Update last success time when we get a new block
  useEffect(() => {
    if (isSuccess && blockNumber !== undefined) {
      setLastSuccessTime(Date.now())
    }
  }, [isSuccess, blockNumber])

  // Check status periodically
  useEffect(() => {
    const checkStatus = () => {
      if (isError) {
        setStatus("disconnected")
        return
      }

      if (lastSuccessTime === null) {
        setStatus("connected") // Initial state, assume connected
        return
      }

      const timeSinceLastBlock = Date.now() - lastSuccessTime

      if (timeSinceLastBlock > DISCONNECT_THRESHOLD_MS) {
        setStatus("disconnected")
      } else if (timeSinceLastBlock > DELAY_THRESHOLD_MS) {
        setStatus("delayed")
      } else {
        setStatus("connected")
      }
    }

    checkStatus()
    const interval = setInterval(checkStatus, 5000)

    return () => clearInterval(interval)
  }, [lastSuccessTime, isError])

  return {
    status,
    lastBlockTime: lastSuccessTime,
    blockNumber,
  }
}
