import { freshInteractionTimestamp, verifyDiscordSignature } from "./discord.ts"

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message)
}

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}

async function signedInteraction(timestamp: string, rawBody: string) {
  const keys = await crypto.subtle.generateKey({ name: "Ed25519" }, true, [
    "sign",
    "verify",
  ])
  if (!("privateKey" in keys)) throw new Error("expected an Ed25519 key pair")
  const signature = await crypto.subtle.sign(
    { name: "Ed25519" },
    keys.privateKey,
    new TextEncoder().encode(timestamp + rawBody),
  )
  return {
    rawBody,
    timestamp,
    signature: toHex(signature),
    publicKey: toHex(await crypto.subtle.exportKey("raw", keys.publicKey)),
  }
}

Deno.test("interaction timestamps older or newer than 5 minutes are refused", () => {
  const nowMs = 1_800_000_000_000
  const now = nowMs / 1000
  assert(freshInteractionTimestamp(String(now), nowMs), "current")
  assert(freshInteractionTimestamp(String(now - 300), nowMs), "5 min old")
  assert(!freshInteractionTimestamp(String(now - 301), nowMs), "stale")
  assert(!freshInteractionTimestamp(String(now + 301), nowMs), "future")
  assert(!freshInteractionTimestamp("", nowMs), "empty")
  assert(!freshInteractionTimestamp("1.8e9", nowMs), "not an integer")
})

Deno.test("a validly signed interaction is refused once its timestamp is stale", async () => {
  const now = Math.floor(Date.now() / 1000)
  const fresh = await signedInteraction(String(now), '{"type":1}')
  assert(await verifyDiscordSignature(fresh), "fresh request verifies")

  const replayed = await signedInteraction(String(now - 600), '{"type":1}')
  assert(!(await verifyDiscordSignature(replayed)), "stale request is refused")
})
