import { type SupabaseClient, checkDiscordMember } from "./discordLink.ts"

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message)
}

const MEMBER_ID = "2222"
const APP_ID = "1111"

// A link token's Discord check counter, kept the way
// claim_/settle_discord_link_auth_check keep it in the database.
function fakeLinkToken(claimError = false) {
  const token = { failures: 0, expired: false }
  const client = {
    rpc(name: string, params: { p_token: string; p_passed?: boolean }) {
      if (claimError) {
        return Promise.resolve({ data: null, error: { message: "down" } })
      }
      if (name === "claim_discord_link_auth_check") {
        const claimed = !token.expired && token.failures < 5
        if (claimed) token.failures += 1
        return Promise.resolve({ data: claimed, error: null })
      }
      if (params.p_passed) token.failures = Math.max(token.failures - 1, 0)
      else if (token.failures >= 5) token.expired = true
      return Promise.resolve({ data: null, error: null })
    },
  } as unknown as SupabaseClient
  return { token, client }
}

// Answers Discord's oauth2/@me: a known access token gets its member, anything
// else a 401. Counts the calls made.
function stubDiscord(status = 200): { calls: number } {
  const counter = { calls: 0 }
  globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    counter.calls += 1
    const auth = new Request(input, init).headers.get("Authorization")
    const known = auth === "Bearer member-token"
    return Promise.resolve(
      new Response(
        JSON.stringify({
          application: { id: APP_ID },
          scopes: ["identify"],
          user: { id: MEMBER_ID, username: "pyke" },
        }),
        { status: known ? status : 401 },
      ),
    )
  }
  return counter
}

function check(client: SupabaseClient, accessToken: string) {
  return checkDiscordMember({
    supabase: client,
    token: "t".repeat(64),
    accessToken,
    discordUserId: MEMBER_ID,
    appId: APP_ID,
  })
}

Deno.test("checkDiscordMember locks a token after 5 failed sign-ins", async () => {
  const realFetch = globalThis.fetch
  try {
    const discord = stubDiscord()
    const { token, client } = fakeLinkToken()
    for (let i = 0; i < 5; i++) {
      assert((await check(client, `junk-${i}`)) === "not_member", "junk fails")
    }
    assert(token.expired, "the fifth failure expires the token")
    for (let i = 0; i < 45; i++) {
      assert((await check(client, `junk-${i}`)) === "locked", "token is locked")
    }
    assert(
      (await check(client, "member-token")) === "locked",
      "even the member is refused once locked",
    )
    assert(discord.calls === 5, "Discord is asked only 5 times")
  } finally {
    globalThis.fetch = realFetch
  }
})

Deno.test("checkDiscordMember doesn't count passes or Discord outages", async () => {
  const realFetch = globalThis.fetch
  try {
    stubDiscord()
    const { token, client } = fakeLinkToken()
    for (let i = 0; i < 4; i++) await check(client, `junk-${i}`)
    for (let i = 0; i < 10; i++) {
      assert((await check(client, "member-token")) === "member", "member passes")
    }
    assert(token.failures === 4 && !token.expired, "passes are handed back")

    stubDiscord(502)
    for (let i = 0; i < 10; i++) {
      assert(
        (await check(client, "member-token")) === "unavailable",
        "an outage is reported",
      )
    }
    assert(token.failures === 4 && !token.expired, "outages are handed back")
  } finally {
    globalThis.fetch = realFetch
  }
})

Deno.test("checkDiscordMember fails closed without the counter", async () => {
  const realFetch = globalThis.fetch
  try {
    const discord = stubDiscord()
    const { client } = fakeLinkToken(true)
    assert(
      (await check(client, "member-token")) === "unavailable",
      "a database error refuses",
    )
    assert(discord.calls === 0, "Discord isn't asked")
  } finally {
    globalThis.fetch = realFetch
  }
})
