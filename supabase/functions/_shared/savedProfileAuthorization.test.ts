import {
  parseSavedProfileMessage,
  savedProfileAuthorizationMessage,
} from "./savedProfileAuthorization.ts"

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message)
}

const base = {
  action: "save-template" as const,
  chainId: 31612 as const,
  ownerAddress: "0x920b1c573F503554E113e4c47A92cd289a3d1625",
  nonce: "nonce-a",
  expiresAt: "2026-10-24T12:05:00.000Z",
}

Deno.test("saved profile proof binds action, chain, owner and nonce", () => {
  const message = savedProfileAuthorizationMessage(base)
  for (const changed of [
    savedProfileAuthorizationMessage({ ...base, action: "delete-template" }),
    savedProfileAuthorizationMessage({ ...base, chainId: 31611 }),
    savedProfileAuthorizationMessage({
      ...base,
      ownerAddress: "0x239f80ED5675B63F26b9f46d8045AC82fea2aea7",
    }),
    savedProfileAuthorizationMessage({ ...base, nonce: "nonce-b" }),
  ]) {
    assert(changed !== message, "changed field must change the message")
  }
  assert(
    message.includes("Owner: 0x920b1c573f503554e113e4c47a92cd289a3d1625"),
    "owner is lower-cased",
  )
})

Deno.test("saved profile message parses back its nonce and expiry", () => {
  const parsed = parseSavedProfileMessage(
    savedProfileAuthorizationMessage(base),
  )
  assert(parsed?.nonce === "nonce-a", "nonce round-trips")
  assert(parsed?.expiresAt === base.expiresAt, "expiry round-trips")
  assert(
    parseSavedProfileMessage("Nonce: x\nExpires at: soon") === null,
    "invalid expiry is rejected",
  )
})
