import {
  discordOAuthUserId,
  freshInteractionTimestamp,
  verifyDiscordSignature,
} from "./discord.ts"

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

// Answers Discord's oauth2/@me with the given status and body, recording the
// requests made.
function stubDiscord(status: number, body: unknown): Request[] {
  const requests: Request[] = []
  globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push(new Request(input, init))
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
    )
  }
  return requests
}

const authorization = {
  application: { id: "1111" },
  scopes: ["identify"],
  expires: "2026-11-06T12:00:00.000000+00:00",
  user: { id: "2222", username: "pyke" },
}

Deno.test("discordOAuthUserId returns the member behind this app's token", async () => {
  const realFetch = globalThis.fetch
  try {
    const requests = stubDiscord(200, authorization)
    const userId = await discordOAuthUserId({ accessToken: "tok", appId: "1111" })
    assert(userId === "2222", "user id is returned")
    assert(
      requests[0].url === "https://discord.com/api/v10/oauth2/@me",
      "asks Discord's oauth2/@me",
    )
    assert(
      requests[0].headers.get("Authorization") === "Bearer tok",
      "sends the access token",
    )
  } finally {
    globalThis.fetch = realFetch
  }
})

Deno.test("discordOAuthUserId refuses other apps' and rejected tokens", async () => {
  const realFetch = globalThis.fetch
  try {
    stubDiscord(200, { ...authorization, application: { id: "9999" } })
    assert(
      (await discordOAuthUserId({ accessToken: "tok", appId: "1111" })) ===
        null,
      "a token for another app is refused",
    )
    stubDiscord(200, { ...authorization, user: undefined })
    assert(
      (await discordOAuthUserId({ accessToken: "tok", appId: "1111" })) ===
        null,
      "a token without identify is refused",
    )
    stubDiscord(401, { message: "401: Unauthorized", code: 0 })
    assert(
      (await discordOAuthUserId({ accessToken: "tok", appId: "1111" })) ===
        null,
      "a token Discord rejects is refused",
    )
    stubDiscord(502, {})
    let threw = false
    try {
      await discordOAuthUserId({ accessToken: "tok", appId: "1111" })
    } catch (_err) {
      threw = true
    }
    assert(threw, "a Discord outage throws")
  } finally {
    globalThis.fetch = realFetch
  }
})
