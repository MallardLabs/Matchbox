/** The Matchbox privacy policy's Developer section (one policy for all). */
export const privacyPolicyUrl =
  "https://matchbox.markets/privacy#matchbox-developer"

/** 301 for the old console privacy page; null for every other path. */
export function privacyRedirect(url: URL): Response | null {
  if (url.pathname !== "/privacy" && url.pathname !== "/privacy/") return null
  return Response.redirect(privacyPolicyUrl, 301)
}
