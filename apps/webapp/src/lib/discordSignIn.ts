// Discord OAuth2 sign-in for the /link page (implicit grant, identify scope).
// The /matchbox link token only says which member asked to link a wallet;
// signing in proves the person finishing /link is that member. Discord sends
// the access token back in the URL fragment, which the inline script in
// _document.tsx moves into sessionStorage and strips from the address bar
// before analytics or any other script loads.

// Where _document.tsx leaves the raw sign-in return for /link: the fragment,
// or the query when Discord reports an error there instead.
export const DISCORD_SIGN_IN_RETURN_KEY = "matchbox-discord-sign-in-return"
const STATE_KEY = "matchbox-discord-sign-in-state"
const LINK_TOKEN_KEY = "matchbox-discord-sign-in-link-token"

export type DiscordSignIn =
  | { status: "signed-in"; linkToken: string; accessToken: string }
  | { status: "failed"; linkToken: string | null }

function randomState(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
}

// Leave for Discord's consent screen. The state ties the return to this tab
// and this link token. Throws when sessionStorage is unavailable.
export function startDiscordSignIn(args: {
  clientId: string
  redirectUri: string
  linkToken: string
}): void {
  const state = randomState()
  sessionStorage.setItem(STATE_KEY, state)
  sessionStorage.setItem(LINK_TOKEN_KEY, args.linkToken)
  const params = new URLSearchParams({
    client_id: args.clientId,
    response_type: "token",
    scope: "identify",
    redirect_uri: args.redirectUri,
    state,
  })
  window.location.assign(`https://discord.com/oauth2/authorize?${params}`)
}

function takeItem(key: string): string | null {
  const value = sessionStorage.getItem(key)
  sessionStorage.removeItem(key)
  return value
}

// The outcome of a sign-in this tab started, read once, or null when the page
// wasn't reached from Discord. A return whose state doesn't match the one this
// tab sent (say, a sign-in someone else started) is a failure, and its token
// is dropped.
export function takeDiscordSignIn(): DiscordSignIn | null {
  try {
    const returned = takeItem(DISCORD_SIGN_IN_RETURN_KEY)
    if (returned === null) return null
    const state = takeItem(STATE_KEY)
    const storedToken = takeItem(LINK_TOKEN_KEY)
    const linkToken =
      storedToken !== null && /^[0-9a-f]{64}$/.test(storedToken)
        ? storedToken
        : null
    const params = new URLSearchParams(returned)
    const accessToken = params.get("access_token")
    if (
      linkToken === null ||
      state === null ||
      params.get("state") !== state ||
      accessToken === null
    ) {
      return { status: "failed", linkToken }
    }
    return { status: "signed-in", linkToken, accessToken }
  } catch (_err) {
    return null
  }
}
