import {
  type Address,
  type Hex,
  type PublicClient,
  decodeFunctionData,
  decodeFunctionResult,
  encodeFunctionData,
  keccak256,
  parseAbi,
  toHex,
} from "viem"

export type SafeBatchCall = {
  to: Address
  value: bigint
  data: Hex
}

export type SafeBatchItem = {
  id: string
  label: string
}

export type PendingSafeBatch = {
  id: Hex
  flow: string
  chainId: number
  safeAddress: Address
  createdAt: number
  fromBlock: string
  nextBlock: string
  calls: Array<{ to: Address; value: string; data: Hex }>
  items: SafeBatchItem[]
}

type SafeTransactionBuilderFile = {
  version: "1.0"
  chainId: string
  createdAt: number
  meta: {
    name: string
    description: string
    txBuilderVersion: string
    createdFromSafeAddress: Address
    createdFromOwnerAddress: string
    checksum?: Hex
  }
  transactions: Array<{
    to: Address
    value: string
    data: Hex
    contractMethod: null
    contractInputsValues: null
  }>
}

const SAFE_ABI = parseAbi([
  "function VERSION() view returns (string)",
  "function getOwners() view returns (address[])",
  "function getThreshold() view returns (uint256)",
  "function execTransaction(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, bytes signatures) payable returns (bool success)",
  "event ExecutionSuccess(bytes32 txHash, uint256 payment)",
])

const MULTISEND_ABI = parseAbi([
  "function multiSend(bytes transactions) payable",
])

export const SAFE_EXECUTION_SUCCESS_EVENT = SAFE_ABI[4]

function serializeForSafeChecksum(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(serializeForSafeChecksum).join(",")}]`
  }

  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>
    const keys = Object.keys(record).sort()
    let serialized = `{${JSON.stringify(keys)}`
    for (const key of keys) {
      serialized += `${serializeForSafeChecksum(record[key])},`
    }
    return `${serialized}}`
  }

  return JSON.stringify(value ?? null)
}

export function calculateSafeBatchChecksum(
  batch: SafeTransactionBuilderFile,
): Hex {
  const { checksum: _checksum, ...metaWithoutChecksum } = batch.meta
  const batchWithoutChecksum: SafeTransactionBuilderFile = {
    ...batch,
    meta: metaWithoutChecksum,
  }

  const serialized = serializeForSafeChecksum({
    ...batchWithoutChecksum,
    meta: { ...batchWithoutChecksum.meta, name: null },
  })

  return keccak256(toHex(serialized))
}

export function createSafeTransactionBuilderFile({
  chainId,
  safeAddress,
  name,
  description,
  calls,
  createdAt = Date.now(),
}: {
  chainId: number
  safeAddress: Address
  name: string
  description: string
  calls: SafeBatchCall[]
  createdAt?: number
}): SafeTransactionBuilderFile {
  const batch: SafeTransactionBuilderFile = {
    version: "1.0",
    chainId: String(chainId),
    createdAt,
    meta: {
      name,
      description,
      txBuilderVersion: "1.0",
      createdFromSafeAddress: safeAddress,
      createdFromOwnerAddress: "",
    },
    transactions: calls.map((call) => ({
      to: call.to,
      value: call.value.toString(),
      data: call.data,
      contractMethod: null,
      contractInputsValues: null,
    })),
  }

  batch.meta.checksum = calculateSafeBatchChecksum(batch)
  return batch
}

export function downloadSafeTransactionBuilderFile(
  batch: SafeTransactionBuilderFile,
): void {
  const blobUrl = URL.createObjectURL(
    new Blob([JSON.stringify(batch, null, 2)], {
      type: "application/json",
    }),
  )
  const anchor = document.createElement("a")
  anchor.href = blobUrl
  anchor.download = `${batch.meta.name.replace(/[^a-z0-9-_]+/gi, "-").replace(/^-|-$/g, "") || "matchbox-safe-batch"}.json`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(blobUrl)
}

export async function verifySafeAccount(
  publicClient: PublicClient,
  address: Address,
): Promise<boolean> {
  try {
    const [versionResult, ownersResult, thresholdResult] = await Promise.all([
      publicClient.call({
        to: address,
        data: encodeFunctionData({ abi: SAFE_ABI, functionName: "VERSION" }),
      }),
      publicClient.call({
        to: address,
        data: encodeFunctionData({ abi: SAFE_ABI, functionName: "getOwners" }),
      }),
      publicClient.call({
        to: address,
        data: encodeFunctionData({
          abi: SAFE_ABI,
          functionName: "getThreshold",
        }),
      }),
    ])
    if (!versionResult.data || !ownersResult.data || !thresholdResult.data) {
      return false
    }

    const version = decodeFunctionResult({
      abi: SAFE_ABI,
      functionName: "VERSION",
      data: versionResult.data,
    })
    const owners = decodeFunctionResult({
      abi: SAFE_ABI,
      functionName: "getOwners",
      data: ownersResult.data,
    })
    const threshold = decodeFunctionResult({
      abi: SAFE_ABI,
      functionName: "getThreshold",
      data: thresholdResult.data,
    })

    return (
      typeof version === "string" &&
      version.length > 0 &&
      Array.isArray(owners) &&
      owners.length > 0 &&
      threshold > 0n &&
      threshold <= BigInt(owners.length)
    )
  } catch {
    return false
  }
}

type ParsedMultiSendCall = SafeBatchCall & { operation: number }

export function parseMultiSendTransactions(data: Hex): ParsedMultiSendCall[] {
  const raw = data.slice(2)
  const calls: ParsedMultiSendCall[] = []
  let offset = 0

  while (offset < raw.length) {
    const fixedLength = 2 + 40 + 64 + 64
    if (raw.length - offset < fixedLength) {
      throw new Error("Invalid MultiSend transaction payload")
    }

    const operation = Number.parseInt(raw.slice(offset, offset + 2), 16)
    offset += 2
    const to = `0x${raw.slice(offset, offset + 40)}` as Address
    offset += 40
    const value = BigInt(`0x${raw.slice(offset, offset + 64)}`)
    offset += 64
    const dataLength = Number(BigInt(`0x${raw.slice(offset, offset + 64)}`))
    offset += 64
    const dataEnd = offset + dataLength * 2
    if (dataEnd > raw.length) {
      throw new Error("Invalid MultiSend call data length")
    }
    const callData = `0x${raw.slice(offset, dataEnd)}` as Hex
    offset = dataEnd

    calls.push({ operation, to, value, data: callData })
  }

  return calls
}

function callsMatch(actual: ParsedMultiSendCall[], expected: SafeBatchCall[]) {
  return (
    actual.length === expected.length &&
    actual.every((call, index) => {
      const target = expected[index]
      return (
        target !== undefined &&
        call.operation === 0 &&
        call.to.toLowerCase() === target.to.toLowerCase() &&
        call.value === target.value &&
        call.data.toLowerCase() === target.data.toLowerCase()
      )
    })
  )
}

export function safeExecutionContainsBatch(
  transactionInput: Hex,
  expectedCalls: SafeBatchCall[],
): boolean {
  try {
    const decodedSafeCall = decodeFunctionData({
      abi: SAFE_ABI,
      data: transactionInput,
    })
    if (decodedSafeCall.functionName !== "execTransaction") return false

    const [to, value, data, operation] = decodedSafeCall.args
    if (expectedCalls.length === 1) {
      const expected = expectedCalls[0]
      return (
        expected !== undefined &&
        operation === 0 &&
        to.toLowerCase() === expected.to.toLowerCase() &&
        value === expected.value &&
        data.toLowerCase() === expected.data.toLowerCase()
      )
    }

    if (operation !== 1) return false
    const decodedMultiSend = decodeFunctionData({
      abi: MULTISEND_ABI,
      data,
    })
    if (decodedMultiSend.functionName !== "multiSend") return false

    return callsMatch(
      parseMultiSendTransactions(decodedMultiSend.args[0]),
      expectedCalls,
    )
  } catch {
    return false
  }
}

export async function waitForSafeBatchExecution({
  publicClient,
  pending,
  signal,
  onScannedBlock,
}: {
  publicClient: PublicClient
  pending: PendingSafeBatch
  signal: AbortSignal
  onScannedBlock: (nextBlock: bigint) => void
}): Promise<Hex> {
  let nextBlock = BigInt(pending.nextBlock)
  const expectedCalls = pending.calls.map((call) => ({
    to: call.to,
    value: BigInt(call.value),
    data: call.data,
  }))

  while (!signal.aborted) {
    const latestBlock = await publicClient.getBlockNumber()
    while (nextBlock <= latestBlock && !signal.aborted) {
      const toBlock =
        nextBlock + 1_999n < latestBlock ? nextBlock + 1_999n : latestBlock
      const logs = await publicClient.getLogs({
        address: pending.safeAddress,
        event: SAFE_EXECUTION_SUCCESS_EVENT,
        fromBlock: nextBlock,
        toBlock,
      })

      for (const log of logs) {
        if (!log.transactionHash) continue
        const transaction = await publicClient.getTransaction({
          hash: log.transactionHash,
        })
        if (safeExecutionContainsBatch(transaction.input, expectedCalls)) {
          return log.transactionHash
        }
      }

      nextBlock = toBlock + 1n
      onScannedBlock(nextBlock)
    }

    await new Promise<void>((resolve) => {
      const timeout = window.setTimeout(resolve, 6_000)
      signal.addEventListener(
        "abort",
        () => {
          window.clearTimeout(timeout)
          resolve()
        },
        { once: true },
      )
    })
  }

  throw new DOMException("Safe batch monitoring stopped", "AbortError")
}

export function createPendingSafeBatch({
  flow,
  chainId,
  safeAddress,
  fromBlock,
  calls,
  items,
  createdAt = Date.now(),
}: {
  flow: string
  chainId: number
  safeAddress: Address
  fromBlock: bigint
  calls: SafeBatchCall[]
  items: SafeBatchItem[]
  createdAt?: number
}): PendingSafeBatch {
  const serializableCalls = calls.map((call) => ({
    to: call.to,
    value: call.value.toString(),
    data: call.data,
  }))
  const id = keccak256(
    toHex(
      JSON.stringify({
        flow,
        chainId,
        safeAddress: safeAddress.toLowerCase(),
        createdAt,
        calls: serializableCalls,
      }),
    ),
  )

  return {
    id,
    flow,
    chainId,
    safeAddress,
    createdAt,
    fromBlock: fromBlock.toString(),
    nextBlock: fromBlock.toString(),
    calls: serializableCalls,
    items,
  }
}

export function encodeSafeBatchCall({
  to,
  abi,
  functionName,
  args,
}: {
  to: Address
  abi: Parameters<typeof encodeFunctionData>[0]["abi"]
  functionName: string
  args: readonly unknown[]
}): SafeBatchCall {
  return {
    to,
    value: 0n,
    data: encodeFunctionData({
      abi,
      functionName,
      args,
    } as Parameters<typeof encodeFunctionData>[0]),
  }
}
