import { useSequentialWrites } from "@/hooks/useWrites"
import { useCallback, useState } from "react"
import type { Hex } from "viem"

/**
 * One wallet signature, waited to its receipt. Resolves to the failure
 * message, or null once the transaction landed.
 */
export function useLockWrite() {
  const writes = useSequentialWrites()
  const [pending, setPending] = useState(false)
  const { run } = writes

  const send = useCallback(
    async (id: string, write: () => Promise<Hex>): Promise<string | null> => {
      const failures: string[] = []
      setPending(true)
      try {
        await run([{ id, write }], (_, status, message) => {
          if (status === "failed")
            failures.push(message ?? "Transaction failed.")
        })
      } finally {
        setPending(false)
      }
      return failures[0] ?? null
    },
    [run],
  )

  return {
    send,
    pending,
    contracts: writes.contracts,
    writeContractAsync: writes.writeContractAsync,
  }
}
