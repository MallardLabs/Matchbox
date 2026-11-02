import { privateKeyToAccount } from "https://esm.sh/viem@2/accounts"
import {
  editorAuthorizationMessage,
  type GaugeController,
  gaugeSignerIsContract,
  isGaugeController,
  parseAuthorizationNonce,
  profileTransferAuthorizationMessage,
  profileWriteAuthorizationMessage,
  sha256,
  signedBy,
  signerIsContract,
} from "./gaugeProfileAuthorization.ts"

function assertEquals(actual: string, expected: string): void {
  if (actual !== expected) {
    throw new Error(`Expected ${expected}, received ${actual}`)
  }
}

function assertNotEquals(actual: string, expected: string): void {
  if (actual === expected) {
    throw new Error(`Expected values to differ, received ${actual}`)
  }
}

const identity = {
  chainId: 31612 as const,
  gaugeAddress: "0x5893a3Fbb51DD117C08Cf0407103ce0809aaC406",
  veBtcTokenId: "1226",
  nftOwnerAddress: "0x920b1c573F503554E113e4c47A92cd289a3d1625",
  controllerAddress: "0xCBdBCAf764881138DeFf673143cEAaAe9c714b00",
  editorAddress: "0x239f80ED5675B63F26b9f46d8045AC82fea2aea7",
  nonce: "nonce-a",
  expiresAt: "2026-08-07T12:05:00.000Z",
}

Deno.test("editor proof binds every authorization boundary", () => {
  const message = editorAuthorizationMessage({
    ...identity,
    action: "grant-editor",
  })

  for (const changed of [
    editorAuthorizationMessage({
      ...identity,
      action: "revoke-editor",
    }),
    editorAuthorizationMessage({
      ...identity,
      action: "grant-editor",
      chainId: 31611,
    }),
    editorAuthorizationMessage({
      ...identity,
      action: "grant-editor",
      gaugeAddress: "0x0000000000000000000000000000000000000001",
    }),
    editorAuthorizationMessage({
      ...identity,
      action: "grant-editor",
      veBtcTokenId: "1227",
    }),
    editorAuthorizationMessage({
      ...identity,
      action: "grant-editor",
      controllerAddress: "0x0000000000000000000000000000000000000002",
    }),
    editorAuthorizationMessage({
      ...identity,
      action: "grant-editor",
      editorAddress: "0x0000000000000000000000000000000000000003",
    }),
    editorAuthorizationMessage({
      ...identity,
      action: "grant-editor",
      nonce: "nonce-b",
    }),
    editorAuthorizationMessage({
      ...identity,
      action: "grant-editor",
      expiresAt: "2026-08-07T12:06:00.000Z",
    }),
  ]) {
    assertNotEquals(changed, message)
  }
})

Deno.test("profile proof binds signer, chain, nonce, and expiry", () => {
  const input = {
    operation: "upsert-profile" as const,
    chainId: 31612 as const,
    gaugeAddress: identity.gaugeAddress,
    veBtcTokenId: identity.veBtcTokenId,
    signerAddress: identity.editorAddress,
    nonce: identity.nonce,
    expiresAt: identity.expiresAt,
  }
  const message = profileWriteAuthorizationMessage(input)

  assertNotEquals(
    profileWriteAuthorizationMessage({ ...input, chainId: 31611 }),
    message,
  )
  assertNotEquals(
    profileWriteAuthorizationMessage({
      ...input,
      signerAddress: identity.controllerAddress,
    }),
    message,
  )
  assertNotEquals(
    profileWriteAuthorizationMessage({ ...input, nonce: "nonce-b" }),
    message,
  )
  assertNotEquals(
    profileWriteAuthorizationMessage({
      ...input,
      expiresAt: "2026-08-07T12:06:00.000Z",
    }),
    message,
  )
})

Deno.test("authorization hashes are stable SHA-256 values", async () => {
  assertEquals(
    await sha256("matchbox"),
    "adf4a84426c4bf916745766e713396ba2ea0b36e571264dc0e547dab9b74ce0a",
  )
})

Deno.test("transfer proof binds both gauges, both tokens and the signer", () => {
  type TransferInput = Parameters<typeof profileTransferAuthorizationMessage>[0]
  const input: TransferInput = {
    chainId: 31612,
    fromGaugeAddress: identity.gaugeAddress,
    fromVeBtcTokenId: identity.veBtcTokenId,
    toGaugeAddress: "0x0000000000000000000000000000000000000004",
    toVeBtcTokenId: "1227",
    signerAddress: identity.nftOwnerAddress,
    nonce: identity.nonce,
    expiresAt: identity.expiresAt,
  }
  const message = profileTransferAuthorizationMessage(input)

  const changes: Partial<TransferInput>[] = [
    { chainId: 31611 },
    { fromGaugeAddress: "0x0000000000000000000000000000000000000005" },
    { fromVeBtcTokenId: "1" },
    { toGaugeAddress: identity.gaugeAddress },
    { toVeBtcTokenId: "2" },
    { signerAddress: identity.controllerAddress },
    { nonce: "nonce-b" },
    { expiresAt: "2026-08-07T12:06:00.000Z" },
  ]
  for (const changed of changes) {
    assertNotEquals(
      profileTransferAuthorizationMessage({ ...input, ...changed }),
      message,
    )
  }
  assertNotEquals(
    profileTransferAuthorizationMessage({
      ...input,
      fromGaugeAddress: input.toGaugeAddress,
      fromVeBtcTokenId: input.toVeBtcTokenId,
      toGaugeAddress: input.fromGaugeAddress,
      toVeBtcTokenId: input.fromVeBtcTokenId,
    }),
    message,
  )
  // Address case does not change what the wallet signs.
  assertEquals(
    profileTransferAuthorizationMessage({
      ...input,
      signerAddress: input.signerAddress.toUpperCase().replace("0X", "0x"),
    }),
    message,
  )

  const parsed = parseAuthorizationNonce(message)
  assertEquals(parsed?.nonce ?? "", identity.nonce)
  assertEquals(parsed?.expiresAt ?? "", identity.expiresAt)
  assertEquals(
    String(parseAuthorizationNonce("Nonce: a\nExpires at: soon")),
    "null",
  )
})

Deno.test("only the NFT owner or its live controller controls a gauge", () => {
  const ownable: GaugeController = {
    chainId: 31612,
    gaugeAddress: "0x5893a3Fbb51DD117C08Cf0407103ce0809aaC406",
    veBtcTokenId: 1226n,
    nftOwnerAddress: "0x920b1c573F503554E113e4c47A92cd289a3d1625",
    controllerAddress: "0xCBdBCAf764881138DeFf673143cEAaAe9c714b00",
    controllerKind: "ownable-eoa",
  }
  const direct: GaugeController = {
    ...ownable,
    controllerAddress: ownable.nftOwnerAddress,
    controllerKind: "direct-eoa",
  }
  const cases: [GaugeController, string, boolean, boolean][] = [
    [ownable, identity.nftOwnerAddress.toLowerCase(), false, true],
    [ownable, identity.controllerAddress, false, false],
    [ownable, identity.controllerAddress.toLowerCase(), true, true],
    [ownable, identity.editorAddress, true, false],
    [direct, identity.nftOwnerAddress, false, true],
    [direct, identity.controllerAddress, true, false],
  ]
  for (const [controller, signer, managed, expected] of cases) {
    assertEquals(
      String(isGaugeController(controller, signer, managed)),
      String(expected),
    )
  }
})

Deno.test("only contract owners or contract controllers count as contract signers", () => {
  const base: GaugeController = {
    chainId: 31612,
    gaugeAddress: "0x5893a3Fbb51DD117C08Cf0407103ce0809aaC406",
    veBtcTokenId: 1226n,
    nftOwnerAddress: "0x920b1c573F503554E113e4c47A92cd289a3d1625",
    controllerAddress: "0xCBdBCAf764881138DeFf673143cEAaAe9c714b00",
    controllerKind: "ownable-eoa",
  }
  const cases: [GaugeController["controllerKind"], string, boolean][] = [
    ["direct-eoa", identity.nftOwnerAddress, false],
    ["direct-contract", identity.nftOwnerAddress.toLowerCase(), true],
    ["ownable-eoa", identity.nftOwnerAddress, true],
    ["ownable-eoa", identity.controllerAddress, false],
    ["ownable-contract", identity.controllerAddress, true],
    ["ownable-contract", identity.editorAddress, false],
  ]
  for (const [controllerKind, signer, expected] of cases) {
    assertEquals(
      String(signerIsContract({ ...base, controllerKind }, signer)),
      String(expected),
    )
  }
})

Deno.test("signatures recover locally and reach the RPC only for contract signers", async () => {
  const account = privateKeyToAccount(`0x${"11".repeat(32)}`)
  const other = privateKeyToAccount(`0x${"22".repeat(32)}`)
  const message = "Matchbox gauge profile transfer authorization"
  const signature = await account.signMessage({ message })
  let rpcCalls = 0
  // Models a hostile RPC that vouches for every signature it is asked about.
  const client = {
    verifyMessage: () => {
      rpcCalls += 1
      return Promise.resolve(true)
    },
  } as unknown as Parameters<typeof signedBy>[0]

  const check = (
    address: `0x${string}`,
    signature: `0x${string}`,
    contractSigner: boolean,
  ) => signedBy(client, { address, message, signature, contractSigner })

  assertEquals(String(await check(account.address, signature, false)), "true")
  assertEquals(String(await check(account.address, signature, true)), "true")
  assertEquals(String(rpcCalls), "0")
  // A forged signature for a plain key never reaches the RPC.
  assertEquals(String(await check(other.address, signature, false)), "false")
  assertEquals(String(await check(other.address, "0xdeadbeef", false)), "false")
  assertEquals(String(rpcCalls), "0")
  // A contract signer is checked through ERC-1271/6492.
  assertEquals(String(await check(other.address, "0xdeadbeef", true)), "true")
  assertEquals(String(rpcCalls), "1")
})

Deno.test("a lazy contract lookup runs only after local recovery fails", async () => {
  const account = privateKeyToAccount(`0x${"11".repeat(32)}`)
  const other = privateKeyToAccount(`0x${"22".repeat(32)}`)
  const message = "Matchbox gauge profile authorization"
  const signature = await account.signMessage({ message })
  let rpcCalls = 0
  let lookups = 0
  const client = {
    verifyMessage: () => {
      rpcCalls += 1
      return Promise.resolve(true)
    },
  } as unknown as Parameters<typeof signedBy>[0]
  const check = (address: `0x${string}`, isContract: boolean) =>
    signedBy(client, {
      address,
      message,
      signature,
      contractSigner: () => {
        lookups += 1
        return Promise.resolve(isContract)
      },
    })

  assertEquals(String(await check(account.address, false)), "true")
  assertEquals(`${lookups}/${rpcCalls}`, "0/0")
  // A forged signature for an address without code never reaches the RPC.
  assertEquals(String(await check(other.address, false)), "false")
  assertEquals(`${lookups}/${rpcCalls}`, "1/0")
  assertEquals(String(await check(other.address, true)), "true")
  assertEquals(`${lookups}/${rpcCalls}`, "2/1")
})

Deno.test("gauge signers reuse controller resolution before asking for code", async () => {
  const contracts = new Set<string>()
  const lookedUp: string[] = []
  const client = {
    getCode: ({ address }: { address: string }) => {
      lookedUp.push(address.toLowerCase())
      return Promise.resolve(
        contracts.has(address.toLowerCase()) ? "0x6080" : undefined,
      )
    },
  } as unknown as Parameters<typeof gaugeSignerIsContract>[0]
  const ownable: GaugeController = {
    chainId: 31612,
    gaugeAddress: "0x5893a3Fbb51DD117C08Cf0407103ce0809aaC406",
    veBtcTokenId: 1226n,
    nftOwnerAddress: "0x920b1c573F503554E113e4c47A92cd289a3d1625",
    controllerAddress: "0xCBdBCAf764881138DeFf673143cEAaAe9c714b00",
    controllerKind: "ownable-eoa",
  }
  const check = async (signer: string) =>
    String(await gaugeSignerIsContract(client, ownable, signer))

  assertEquals(await check(identity.nftOwnerAddress), "true")
  assertEquals(await check(identity.controllerAddress.toLowerCase()), "false")
  assertEquals(String(lookedUp.length), "0")
  // A delegated editor is looked up onchain.
  const editor = identity.editorAddress.toLowerCase()
  assertEquals(await check(identity.editorAddress), "false")
  contracts.add(editor)
  assertEquals(await check(identity.editorAddress), "true")
  assertEquals(lookedUp.join(","), `${editor},${editor}`)
})
