import { type Address, type Hex, keccak256, toHex } from "viem"

export type SafeBatchCall = {
  to: Address
  value: bigint
  data: Hex
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

export function buildVoteSafeJson(input: {
  chainId: number
  safeAddress: Address
  calls: SafeBatchCall[]
}): string {
  return JSON.stringify(
    createSafeTransactionBuilderFile({
      chainId: input.chainId,
      safeAddress: input.safeAddress,
      name: `Matchbox vote ${input.calls.length} locks`,
      description: "Matchbox Pro veMEZO vote batch",
      calls: input.calls,
    }),
    null,
    2,
  )
}
