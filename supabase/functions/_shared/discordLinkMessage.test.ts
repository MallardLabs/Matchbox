import { parseSiweMessage } from "https://esm.sh/viem@2/siwe"
import { buildLinkMessage, buildUnlinkMessage } from "./discordLinkMessage.ts"

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message)
}

function throws(fn: () => unknown): boolean {
  try {
    fn()
    return false
  } catch (_err) {
    return true
  }
}

const link = {
  webappUrl: "https://app.matchbox.markets",
  discordUserId: "123456789012345678",
  discordUsername: "pyke",
  address: "0x920b1c573f503554e113e4c47a92cd289a3d1625",
  nonce: "0123456789abcdef0123456789abcdef",
  issuedAt: "2026-10-30T12:00:00.000Z",
  expiresAt: "2026-10-30T12:15:00.000Z",
}

Deno.test("link message is EIP-4361 naming the Discord account", () => {
  const parsed = parseSiweMessage(buildLinkMessage(link))
  assert(parsed.domain === "app.matchbox.markets", "domain is the webapp host")
  assert(parsed.uri === "https://app.matchbox.markets/link", "uri is /link")
  assert(
    parsed.address === "0x920b1c573F503554E113e4c47A92cd289a3d1625",
    "address is checksummed",
  )
  assert(parsed.chainId === 31612, "chain is Mezo mainnet")
  assert(parsed.nonce === link.nonce, "nonce round-trips")
  assert(
    parsed.expirationTime?.toISOString() === link.expiresAt,
    "expiry round-trips",
  )
  assert(
    parsed.statement ===
      "Link this wallet to Discord account @pyke (ID 123456789012345678). " +
        "Only sign if that Discord account is yours.",
    "statement names the username and ID",
  )
  assert(
    parsed.resources?.[0] === "https://discord.com/users/123456789012345678",
    "resource is the Discord account",
  )
})

Deno.test("link message binds Discord account, wallet, nonce and expiry", () => {
  const message = buildLinkMessage(link)
  assert(buildLinkMessage(link) === message, "message is deterministic")
  for (const changed of [
    buildLinkMessage({ ...link, discordUserId: "123456789012345679" }),
    buildLinkMessage({ ...link, discordUsername: "pyke2" }),
    buildLinkMessage({
      ...link,
      address: "0x239f80ED5675B63F26b9f46d8045AC82fea2aea7",
    }),
    buildLinkMessage({ ...link, nonce: "fedcba9876543210fedcba9876543210" }),
    buildLinkMessage({ ...link, expiresAt: "2026-10-30T12:14:00.000Z" }),
    buildLinkMessage({ ...link, webappUrl: "https://matchbox.example" }),
  ]) {
    assert(changed !== message, "changed field must change the message")
  }
})

Deno.test("link message names the account by ID when the username can't be shown", () => {
  for (const discordUsername of [null, "Old Name#1234", "naïve", "a"]) {
    const parsed = parseSiweMessage(
      buildLinkMessage({ ...link, discordUsername }),
    )
    assert(
      parsed.statement?.startsWith(
        "Link this wallet to Discord account ID 123456789012345678.",
      ) === true,
      `username ${discordUsername} is left out`,
    )
  }
  assert(
    throws(() => buildLinkMessage({ ...link, discordUserId: "1 (ID 2)" })),
    "a non-numeric Discord ID is refused",
  )
})

const unlink = {
  webappUrl: "https://app.matchbox.markets",
  address: "0x920b1c573f503554e113e4c47a92cd289a3d1625",
  nonce: "0123456789abcdef0123456789abcdef",
  issuedAt: "2026-10-30T12:00:00.000Z",
  expiresAt: "2026-10-30T12:05:00.000Z",
}

Deno.test("unlink message is EIP-4361 for the webapp domain", () => {
  const parsed = parseSiweMessage(buildUnlinkMessage(unlink))
  assert(parsed.domain === "app.matchbox.markets", "domain is the webapp host")
  assert(parsed.uri === unlink.webappUrl, "uri is the webapp")
  assert(
    parsed.address === "0x920b1c573F503554E113e4c47A92cd289a3d1625",
    "address is checksummed",
  )
  assert(parsed.chainId === 31612, "chain is Mezo mainnet")
  assert(parsed.nonce === unlink.nonce, "nonce round-trips")
  assert(
    parsed.issuedAt?.toISOString() === unlink.issuedAt,
    "issued-at round-trips",
  )
  assert(
    parsed.expirationTime?.toISOString() === unlink.expiresAt,
    "expiry round-trips",
  )
})

Deno.test("unlink message binds wallet, nonce and expiry", () => {
  const message = buildUnlinkMessage(unlink)
  assert(buildUnlinkMessage(unlink) === message, "message is deterministic")
  for (const changed of [
    buildUnlinkMessage({
      ...unlink,
      address: "0x239f80ED5675B63F26b9f46d8045AC82fea2aea7",
    }),
    buildUnlinkMessage({ ...unlink, nonce: "fedcba9876543210fedcba9876543210" }),
    buildUnlinkMessage({ ...unlink, expiresAt: "2026-10-30T12:04:00.000Z" }),
    buildUnlinkMessage({ ...unlink, webappUrl: "https://matchbox.example" }),
  ]) {
    assert(changed !== message, "changed field must change the message")
  }
})
