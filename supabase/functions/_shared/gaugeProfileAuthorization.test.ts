import {
  editorAuthorizationMessage,
  type GaugeController,
  isGaugeController,
  parseAuthorizationNonce,
  profileTransferAuthorizationMessage,
  profileWriteAuthorizationMessage,
  sha256,
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
