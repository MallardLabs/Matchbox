// Discord REST + interaction helpers shared by the Matchbox edge functions.
// Docs: https://discord.com/developers/docs/interactions/receiving-and-responding

const DISCORD_API = "https://discord.com/api/v10"

// Interaction response types.
export const InteractionResponseType = {
  PONG: 1,
  CHANNEL_MESSAGE_WITH_SOURCE: 4,
  DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE: 5,
} as const

// Interaction request types.
export const InteractionType = {
  PING: 1,
  APPLICATION_COMMAND: 2,
  MESSAGE_COMPONENT: 3,
} as const

// Message flags. 64 = EPHEMERAL (only the invoking user sees it).
export const MessageFlags = {
  EPHEMERAL: 64,
} as const

// Component / button styles.
export const ButtonStyle = {
  PRIMARY: 1,
  SECONDARY: 2,
  SUCCESS: 3,
  DANGER: 4,
  LINK: 5,
} as const

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

// Verify the Ed25519 signature Discord attaches to every interaction request.
// Returns false on any malformed input rather than throwing.
export async function verifyDiscordSignature(args: {
  rawBody: string
  signature: string | null
  timestamp: string | null
  publicKey: string
}): Promise<boolean> {
  const { rawBody, signature, timestamp, publicKey } = args
  if (!signature || !timestamp) return false
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      hexToBytes(publicKey),
      { name: "Ed25519" },
      false,
      ["verify"],
    )
    const message = new TextEncoder().encode(timestamp + rawBody)
    return await crypto.subtle.verify(
      { name: "Ed25519" },
      key,
      hexToBytes(signature),
      message,
    )
  } catch (_err) {
    return false
  }
}

async function discordRequest(
  method: string,
  path: string,
  body?: unknown,
): Promise<Response> {
  const token = Deno.env.get("DISCORD_BOT_TOKEN")
  if (!token) throw new Error("Missing DISCORD_BOT_TOKEN")
  return await fetch(`${DISCORD_API}${path}`, {
    method,
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

// Add a bot-managed Academy role. Idempotent on Discord's side (no-op if
// already held).
export async function addGuildRole(args: {
  guildId: string
  userId: string
  roleId: string
}): Promise<boolean> {
  const res = await discordRequest(
    "PUT",
    `/guilds/${args.guildId}/members/${args.userId}/roles/${args.roleId}`,
  )
  if (!res.ok) {
    console.warn(`addGuildRole failed (${res.status}): ${await res.text()}`)
  }
  return res.ok
}

// Remove a bot-managed Academy role. Idempotent (no-op if not held).
export async function removeGuildRole(args: {
  guildId: string
  userId: string
  roleId: string
}): Promise<boolean> {
  const res = await discordRequest(
    "DELETE",
    `/guilds/${args.guildId}/members/${args.userId}/roles/${args.roleId}`,
  )
  if (!res.ok && res.status !== 404) {
    console.warn(`removeGuildRole failed (${res.status}): ${await res.text()}`)
  }
  return res.ok || res.status === 404
}

// Edit the original (deferred) interaction reply via the interaction webhook.
export async function editOriginalInteraction(args: {
  appId: string
  interactionToken: string
  payload: unknown
}): Promise<boolean> {
  const res = await fetch(
    `${DISCORD_API}/webhooks/${args.appId}/${args.interactionToken}/messages/@original`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args.payload),
    },
  )
  if (!res.ok) {
    console.warn(
      `editOriginalInteraction failed (${res.status}): ${await res.text()}`,
    )
  }
  return res.ok
}

// Build a CDN avatar URL, falling back to the user's default embed avatar.
export function avatarUrl(userId: string, avatarHash: string | null): string {
  if (avatarHash) {
    const ext = avatarHash.startsWith("a_") ? "gif" : "png"
    return `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}.${ext}?size=128`
  }
  // New username system: default avatar index = (id >> 22) % 6
  let index = 0
  try {
    index = Number((BigInt(userId) >> 22n) % 6n)
  } catch (_err) {
    index = 0
  }
  return `https://cdn.discordapp.com/embed/avatars/${index}.png`
}
