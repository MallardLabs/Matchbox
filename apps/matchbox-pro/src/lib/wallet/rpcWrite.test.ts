import { describe, expect, it } from "vitest"
import {
  isEmptyRawTransactionError,
  isMutationRpcMethod,
  normalizeRawTransaction,
  prepareRpcRequest,
} from "./rpcWrite"

describe("Mezo write RPC handling", () => {
  it("treats send and sign methods as unbatched mutations", () => {
    expect(isMutationRpcMethod("eth_sendRawTransaction")).toBe(true)
    expect(isMutationRpcMethod("eth_sendTransaction")).toBe(true)
    expect(isMutationRpcMethod("eth_call")).toBe(false)
  })

  it("keeps a hex raw transaction and unwraps nested ones", () => {
    expect(normalizeRawTransaction(["0xabc123"])).toBe("0xabc123")
    expect(normalizeRawTransaction([{ serializedTransaction: "0xdead" }])).toBe(
      "0xdead",
    )
  })

  it("rejects an empty payload before it reaches the node", () => {
    expect(() =>
      prepareRpcRequest({ method: "eth_sendRawTransaction", params: [{}] }),
    ).toThrow(/empty signed transaction/)
  })

  it("leaves reads unchanged", () => {
    const args = { method: "eth_getBalance", params: ["0x1", "latest"] }
    expect(prepareRpcRequest(args)).toEqual(args)
  })

  it("recognises mezod's unmarshal error as an empty transaction", () => {
    expect(
      isEmptyRawTransactionError(
        "json: cannot unmarshal non-string into Go value of type hexutil.Bytes",
      ),
    ).toBe(true)
  })
})
