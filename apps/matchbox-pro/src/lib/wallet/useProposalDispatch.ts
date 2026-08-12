import { useCallback, useMemo, useState } from "react"
import { getAddress, isAddress, isHex } from "viem"
import {
  useAccount,
  usePublicClient,
  useSendTransaction,
  useSwitchChain,
} from "wagmi"
import type { QueryBlock, WalletContext } from "../query/contracts"
import { mezoMainnet } from "./config"

type TransactionRequest = Extract<
  QueryBlock,
  { type: "vote_composer" }
>["transactionRequests"][number]

export type DispatchCallState = {
  key: string
  label: string
  status: "idle" | "opening-wallet" | "submitted" | "confirmed" | "failed"
  hash: `0x${string}` | null
  error: string | null
}

type DispatchDependencies = {
  accountAddress: string | undefined
  accountChainId: number | undefined
  wallet: WalletContext
  requests: TransactionRequest[]
  previousCalls?: DispatchCallState[]
  switchChain: (chainId: number) => Promise<void>
  send: (request: TransactionRequest) => Promise<`0x${string}`>
  wait: (hash: `0x${string}`) => Promise<"success" | "reverted">
  onCalls: (calls: DispatchCallState[]) => void
}

function requestKey(request: TransactionRequest): string {
  return [
    request.chainId,
    request.from.toLowerCase(),
    request.to.toLowerCase(),
    request.data.toLowerCase(),
    request.value,
  ].join(":")
}

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  if (/user rejected|rejected the request|4001/i.test(message)) {
    return "You rejected this wallet request. Nothing after it was submitted."
  }
  return message.replace(/\s+/g, " ").slice(0, 240)
}

function initialCalls(
  requests: TransactionRequest[],
  previousCalls: DispatchCallState[] = [],
): DispatchCallState[] {
  const previousByKey = new Map(previousCalls.map((call) => [call.key, call]))
  return requests.map((request) => {
    const key = requestKey(request)
    const previous = previousByKey.get(key)
    return previous?.status === "confirmed"
      ? previous
      : {
          key,
          label: request.label,
          status: "idle",
          hash: null,
          error: null,
        }
  })
}

export async function dispatchProposalRequests(
  input: DispatchDependencies,
): Promise<DispatchCallState[]> {
  if (input.wallet.mode !== "connected") {
    throw new Error("Connect this wallet to continue")
  }
  if (!input.accountAddress || !isAddress(input.accountAddress)) {
    throw new Error("Connect this wallet to continue")
  }
  const account = getAddress(input.accountAddress)
  if (account.toLowerCase() !== input.wallet.address.toLowerCase()) {
    throw new Error("The connected wallet does not match this proposal")
  }
  if (input.requests.length === 0) {
    throw new Error("This proposal has no unsigned requests")
  }
  for (const request of input.requests) {
    if (request.chainId !== mezoMainnet.id) {
      throw new Error("This proposal is not bound to Mezo Mainnet")
    }
    if (request.from.toLowerCase() !== account.toLowerCase()) {
      throw new Error("The connected wallet does not match a proposal call")
    }
  }
  if (input.accountChainId !== mezoMainnet.id) {
    await input.switchChain(mezoMainnet.id)
  }

  const calls = initialCalls(input.requests, input.previousCalls)
  input.onCalls([...calls])
  for (let index = 0; index < input.requests.length; index += 1) {
    const request = input.requests[index]
    const call = calls[index]
    if (!request || !call || call.status === "confirmed") continue
    try {
      calls[index] = { ...call, status: "opening-wallet", error: null }
      input.onCalls([...calls])
      const hash = await input.send(request)
      const submittedCall: DispatchCallState = {
        ...call,
        status: "submitted",
        hash,
        error: null,
      }
      calls[index] = submittedCall
      input.onCalls([...calls])
      const receiptStatus = await input.wait(hash)
      if (receiptStatus !== "success") {
        throw new Error("Your wallet submitted this call, but it reverted")
      }
      calls[index] = { ...submittedCall, status: "confirmed" }
      input.onCalls([...calls])
    } catch (error) {
      calls[index] = {
        ...call,
        status: "failed",
        hash: calls[index]?.hash ?? null,
        error: errorMessage(error),
      }
      input.onCalls([...calls])
      return calls
    }
  }
  return calls
}

export function useProposalDispatch(input: {
  wallet: WalletContext
  requests: TransactionRequest[]
  refresh?: () => Promise<{
    requests: TransactionRequest[]
    diff: Extract<QueryBlock, { type: "allocation_diff" }>
  }>
}) {
  const account = useAccount()
  const publicClient = usePublicClient({ chainId: mezoMainnet.id })
  const { sendTransactionAsync } = useSendTransaction()
  const { switchChainAsync } = useSwitchChain()
  const [calls, setCalls] = useState<DispatchCallState[]>([])
  const [error, setError] = useState<string | null>(null)
  const [dispatching, setDispatching] = useState(false)
  const [diff, setDiff] = useState<Extract<
    QueryBlock,
    { type: "allocation_diff" }
  > | null>(null)
  const [pendingRequests, setPendingRequests] = useState<
    TransactionRequest[] | null
  >(null)

  const canDispatch = useMemo(
    () =>
      input.wallet.mode === "connected" &&
      !!account.address &&
      account.address.toLowerCase() === input.wallet.address.toLowerCase() &&
      input.requests.length > 0,
    [account.address, input.requests.length, input.wallet],
  )

  const sendRequests = useCallback(
    async (requests: TransactionRequest[]): Promise<void> => {
      if (!publicClient) throw new Error("Mezo Mainnet RPC is unavailable")
      await dispatchProposalRequests({
        accountAddress: account.address,
        accountChainId: account.chainId,
        wallet: input.wallet,
        requests,
        previousCalls: calls,
        switchChain: async (chainId) => {
          await switchChainAsync({ chainId })
        },
        send: async (request) => {
          if (!isAddress(request.to) || !isHex(request.data)) {
            throw new Error("The refreshed proposal contains an invalid call")
          }
          return sendTransactionAsync({
            chainId: mezoMainnet.id,
            to: getAddress(request.to),
            data: request.data,
            value: 0n,
          })
        },
        wait: async (hash) => {
          const receipt = await publicClient.waitForTransactionReceipt({ hash })
          return receipt.status
        },
        onCalls: setCalls,
      })
    },
    [
      account.address,
      account.chainId,
      calls,
      input.wallet,
      publicClient,
      sendTransactionAsync,
      switchChainAsync,
    ],
  )

  const dispatch = useCallback(async (): Promise<void> => {
    setDispatching(true)
    setError(null)
    try {
      const refreshed = input.refresh ? await input.refresh() : null
      const requests = refreshed?.requests ?? input.requests
      if (refreshed?.diff.material) {
        setDiff(refreshed.diff)
        setPendingRequests(requests)
        return
      }
      setDiff(refreshed?.diff ?? null)
      setPendingRequests(null)
      await sendRequests(requests)
    } catch (dispatchError) {
      setError(errorMessage(dispatchError))
    } finally {
      setDispatching(false)
    }
  }, [input, sendRequests])

  const acknowledgeAndDispatch = useCallback(async (): Promise<void> => {
    if (!pendingRequests) return
    setDispatching(true)
    setError(null)
    try {
      await sendRequests(pendingRequests)
      setPendingRequests(null)
    } catch (dispatchError) {
      setError(errorMessage(dispatchError))
    } finally {
      setDispatching(false)
    }
  }, [pendingRequests, sendRequests])

  const resetReview = useCallback((): void => {
    setDiff(null)
    setPendingRequests(null)
    setError(null)
  }, [])

  return {
    acknowledgeAndDispatch,
    awaitingAcknowledgement: !!pendingRequests,
    calls,
    canDispatch,
    diff,
    dispatch,
    dispatching,
    error,
    resetReview,
  }
}
