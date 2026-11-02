import assert from "node:assert/strict"
import test from "node:test"
import {
  WrongNetworkError,
  assertWalletChain,
  getChainLabel,
  isWrongWalletNetwork,
} from "./walletNetwork"

const MAINNET = 31612
const TESTNET = 31611

test("labels the Mezo networks, Ethereum and unknown chains", () => {
  assert.equal(getChainLabel(MAINNET), "Mezo Mainnet")
  assert.equal(getChainLabel(TESTNET), "Mezo Testnet")
  assert.equal(getChainLabel(1), "Ethereum")
  assert.equal(getChainLabel(42161), "Chain 42161")
})

test("flags a wallet on another chain than the UI network", () => {
  assert.equal(isWrongWalletNetwork(MAINNET, TESTNET), true)
  assert.equal(isWrongWalletNetwork(1, MAINNET), true)
  assert.equal(isWrongWalletNetwork(TESTNET, TESTNET), false)
  assert.equal(isWrongWalletNetwork(undefined, TESTNET), false)
})

test("refuses to sign when the wallet sits on Mezo mainnet and the UI shows Testnet", () => {
  assert.throws(
    () => assertWalletChain(MAINNET, TESTNET),
    (error: unknown) => {
      assert.ok(error instanceof WrongNetworkError)
      assert.equal(error.walletChainId, MAINNET)
      assert.equal(error.expectedChainId, TESTNET)
      assert.equal(
        error.message,
        "Wallet on Mezo Mainnet, expected Mezo Testnet",
      )
      return true
    },
  )
})

test("lets the write through on the matching chain or without a connector", () => {
  assert.doesNotThrow(() => assertWalletChain(TESTNET, TESTNET))
  assert.doesNotThrow(() => assertWalletChain(undefined, MAINNET))
})
