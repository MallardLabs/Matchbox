import assert from "node:assert/strict"
import test from "node:test"
import {
  ChainMismatchError,
  TransactionExecutionError,
  defineChain,
} from "viem"
import {
  formatWalletWriteError,
  isMutationRpcMethod,
  normalizeRawTransaction,
  prepareRpcRequest,
  toJsonRpcAccount,
} from "./mezoRpcWrite"

test("treats send and sign methods as mutations that must not be batched", () => {
  assert.equal(isMutationRpcMethod("eth_sendRawTransaction"), true)
  assert.equal(isMutationRpcMethod("eth_sendTransaction"), true)
  assert.equal(isMutationRpcMethod("eth_call"), false)
  assert.equal(isMutationRpcMethod("eth_getBalance"), false)
})

test("keeps a hex raw transaction", () => {
  assert.equal(normalizeRawTransaction(["0xabc123"]), "0xabc123")
})

test("extracts a nested serialized transaction", () => {
  assert.equal(
    normalizeRawTransaction([{ serializedTransaction: "0xdead" }]),
    "0xdead",
  )
})

test("rejects an empty object payload", () => {
  assert.throws(() => normalizeRawTransaction([{}]), /empty signed transaction/)
})

test("prepareRpcRequest rewrites empty sendRaw params before they hit the node", () => {
  assert.throws(
    () =>
      prepareRpcRequest({
        method: "eth_sendRawTransaction",
        params: [{}],
      }),
    /empty signed transaction/,
  )
})

test("prepareRpcRequest leaves reads unchanged", () => {
  const args = { method: "eth_getBalance", params: ["0x1", "latest"] }
  assert.deepEqual(prepareRpcRequest(args), args)
})

test("forces a json-rpc account so the wallet broadcasts", () => {
  assert.deepEqual(toJsonRpcAccount("0xabc"), {
    address: "0xabc",
    type: "json-rpc",
  })
})

test("maps mezod unmarshal errors to the empty-tx guidance", () => {
  const formatted = formatWalletWriteError(
    new Error(
      "invalid argument 0: json: cannot unmarshal non-string into Go value of type hexutil.Bytes",
    ),
  )
  assert.match(formatted, /empty signed transaction/)
})

test("maps viem's chain mismatch to the wrong-network label", () => {
  // wagmi passes `chain: { id }` without a name for a pinned write.
  const mismatch = new ChainMismatchError({
    chain: defineChain({
      id: 31611,
      name: "",
      nativeCurrency: { name: "BTC", symbol: "BTC", decimals: 18 },
      rpcUrls: { default: { http: [] } },
    }),
    currentChainId: 31612,
  })
  const formatted = formatWalletWriteError(
    new TransactionExecutionError(mismatch, { account: null }),
  )
  assert.equal(formatted, "Wallet on Mezo Mainnet, expected Mezo Testnet")
})
