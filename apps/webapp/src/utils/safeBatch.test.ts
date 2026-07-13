import assert from "node:assert/strict"
import test from "node:test"
import {
  type Address,
  type Hex,
  concatHex,
  encodeFunctionData,
  numberToHex,
  parseAbi,
  size,
} from "viem"
import {
  type SafeBatchCall,
  calculateSafeBatchChecksum,
  createSafeTransactionBuilderFile,
  safeExecutionContainsBatch,
} from "./safeBatch"

const SAFE_ABI = parseAbi([
  "function execTransaction(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, bytes signatures) payable returns (bool success)",
])
const MULTISEND_ABI = parseAbi([
  "function multiSend(bytes transactions) payable",
])
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"
const SAFE = "0x1111111111111111111111111111111111111111" as Address
const MULTISEND = "0x2222222222222222222222222222222222222222" as Address

const calls: SafeBatchCall[] = [
  {
    to: "0x3333333333333333333333333333333333333333",
    value: 0n,
    data: "0x12345678",
  },
  {
    to: "0x4444444444444444444444444444444444444444",
    value: 7n,
    data: "0xabcdef",
  },
]

function encodeMultiSendCalls(batchCalls: SafeBatchCall[]): Hex {
  return concatHex(
    batchCalls.flatMap((call) => [
      numberToHex(0, { size: 1 }),
      call.to,
      numberToHex(call.value, { size: 32 }),
      numberToHex(size(call.data), { size: 32 }),
      call.data,
    ]),
  )
}

function encodeSafeExecution(batchCalls: SafeBatchCall[]): Hex {
  const multiSendData = encodeFunctionData({
    abi: MULTISEND_ABI,
    functionName: "multiSend",
    args: [encodeMultiSendCalls(batchCalls)],
  })

  return encodeFunctionData({
    abi: SAFE_ABI,
    functionName: "execTransaction",
    args: [
      MULTISEND,
      0n,
      multiSendData,
      1,
      0n,
      0n,
      0n,
      ZERO_ADDRESS,
      ZERO_ADDRESS,
      "0x",
    ],
  })
}

test("creates a checksummed Safe Transaction Builder file", () => {
  const batch = createSafeTransactionBuilderFile({
    chainId: 31612,
    safeAddress: SAFE,
    name: "Matchbox votes",
    description: "test",
    calls,
    createdAt: 1_700_000_000_000,
  })

  assert.equal(batch.transactions.length, 2)
  assert.equal(batch.transactions[0]?.data, calls[0]?.data)
  assert.equal(batch.meta.checksum, calculateSafeBatchChecksum(batch))
})

test("recognizes the exact exported calls inside a Safe MultiSend", () => {
  const input = encodeSafeExecution(calls)
  assert.equal(safeExecutionContainsBatch(input, calls), true)
  assert.equal(
    safeExecutionContainsBatch(input, [
      calls[0] as SafeBatchCall,
      { ...(calls[1] as SafeBatchCall), data: "0xdeadbeef" },
    ]),
    false,
  )
})
