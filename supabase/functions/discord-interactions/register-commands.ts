// Registers the /matchbox slash command with Discord.
//
// Guild-scoped commands appear instantly (global commands can take up to an hour),
// so this registers to DISCORD_GUILD_ID. Re-run it whenever the command definition
// changes.
//
// Usage:
//   DISCORD_APP_ID=... DISCORD_BOT_TOKEN=... DISCORD_GUILD_ID=... \
//     deno run --allow-env --allow-net register-commands.ts

const appId = Deno.env.get("DISCORD_APP_ID")
const botToken = Deno.env.get("DISCORD_BOT_TOKEN")
const guildId = Deno.env.get("DISCORD_GUILD_ID")

if (!appId || !botToken || !guildId) {
  console.error(
    "Missing env: DISCORD_APP_ID, DISCORD_BOT_TOKEN, and DISCORD_GUILD_ID are all required.",
  )
  Deno.exit(1)
}

const commands = [
  {
    name: "matchbox",
    description: "Link your wallet and view your Mezo Academy points",
    type: 1, // CHAT_INPUT
  },
]

const res = await fetch(
  `https://discord.com/api/v10/applications/${appId}/guilds/${guildId}/commands`,
  {
    method: "PUT",
    headers: {
      Authorization: `Bot ${botToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(commands),
  },
)

if (!res.ok) {
  console.error(`Failed to register commands (${res.status}):`)
  console.error(await res.text())
  Deno.exit(1)
}

console.log("Registered /matchbox to guild", guildId)
console.log(await res.json())
