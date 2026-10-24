export type SavedProfileAction = "save-template" | "delete-template"

/** Message the owner's wallet signs to write a saved profile template. */
export function savedProfileAuthorizationMessage(input: {
  action: SavedProfileAction
  chainId: 31611 | 31612
  ownerAddress: string
  nonce: string
  expiresAt: string
}): string {
  return [
    "Matchbox saved profile authorization",
    `Action: ${input.action}`,
    `Chain: ${input.chainId}`,
    `Owner: ${input.ownerAddress.toLowerCase()}`,
    `Nonce: ${input.nonce}`,
    `Expires at: ${input.expiresAt}`,
    "This signature is gasless and cannot submit a transaction.",
  ].join("\n")
}

/** Reads the nonce and expiry back out of a signed message. */
export function parseSavedProfileMessage(
  message: string,
): { nonce: string; expiresAt: string } | null {
  const lines = message.split("\n")
  const nonce = lines
    .find((line) => line.startsWith("Nonce: "))
    ?.slice("Nonce: ".length)
  const expiresAt = lines
    .find((line) => line.startsWith("Expires at: "))
    ?.slice("Expires at: ".length)
  if (!nonce || !expiresAt || !Number.isFinite(Date.parse(expiresAt))) {
    return null
  }
  return { nonce, expiresAt }
}
