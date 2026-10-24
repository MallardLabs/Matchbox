/** Worker `vars` that act as per-product kill switches (`"true"` = on). */
export type FlagEnv = {
  MATCHBOX_ID_ENABLED?: string
  DEVELOPER_CONSOLE_ENABLED?: string
  GAUGE_PROFILE_API_ENABLED?: string
  DISCORD_CLAIMS_ENABLED?: string
}

export type PlatformFlags = {
  matchboxId: boolean
  developerConsole: boolean
  gaugeProfileApi: boolean
  discordClaims: boolean
}

function isOn(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "true"
}

/** Reads kill switches; anything other than `"true"` (or missing) is off. */
export default function flags(env: FlagEnv): PlatformFlags {
  return {
    matchboxId: isOn(env.MATCHBOX_ID_ENABLED),
    developerConsole: isOn(env.DEVELOPER_CONSOLE_ENABLED),
    gaugeProfileApi: isOn(env.GAUGE_PROFILE_API_ENABLED),
    discordClaims: isOn(env.DISCORD_CLAIMS_ENABLED),
  }
}
