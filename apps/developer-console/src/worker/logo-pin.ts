/**
 * Pins the app logo at staff approval. `logoUrl` is any HTTPS URL the
 * developer controls, so the bytes behind it can change after review.
 * Matchbox ID shows a verified app's logo only from this copy
 * (`mbx_dev_verified_logos`); when the logo cannot be pinned, the verified
 * consent screen shows the app's initial instead.
 */

export const maxPinnedLogoBytes = 64 * 1024
export const logoFetchTimeoutMs = 5_000

export type PinnedLogoType =
  | "image/png"
  | "image/jpeg"
  | "image/gif"
  | "image/webp"

export type PinnedLogo = {
  contentType: PinnedLogoType
  dataBase64: string
  /** Hex SHA-256 of the bytes. */
  sha256: string
  /** The `logoUrl` it was fetched from. */
  sourceUrl: string
}

export type LogoFetch = (url: string, init: RequestInit) => Promise<Response>

export type PinLogoResult =
  | { ok: true; logo: PinnedLogo }
  | { ok: false; reason: string }

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  return signature.every((value, index) => bytes[index] === value)
}

/** Image type by magic bytes; the server's Content-Type is not trusted. */
export function sniffLogoType(bytes: Uint8Array): PinnedLogoType | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png"
  }
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg"
  if (
    startsWith(bytes, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) ||
    startsWith(bytes, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61])
  ) {
    return "image/gif"
  }
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(bytes.subarray(8), [0x57, 0x45, 0x42, 0x50])
  ) {
    return "image/webp"
  }
  return null
}

/** Reads at most `limit` bytes; null when the body is longer. */
async function readCapped(
  response: Response,
  limit: number,
): Promise<Uint8Array | null> {
  if (response.body === null) return new Uint8Array()
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > limit) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

function toBase64(bytes: Uint8Array): string {
  let binary = ""
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
  }
  return btoa(binary)
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))
  return Array.from(digest, (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("")
}

/** Fetches and checks the logo; never throws. */
export async function pinLogo(
  fetchLogo: LogoFetch,
  url: string,
): Promise<PinLogoResult> {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return { ok: false, reason: "invalid-url" }
  }
  if (parsed.protocol !== "https:") return { ok: false, reason: "not-https" }
  try {
    const response = await fetchLogo(parsed.href, {
      headers: { Accept: "image/png,image/jpeg,image/gif,image/webp" },
      redirect: "follow",
      signal: AbortSignal.timeout(logoFetchTimeoutMs),
    })
    if (response.url !== "" && !response.url.startsWith("https://")) {
      await response.body?.cancel()
      return { ok: false, reason: "not-https" }
    }
    if (!response.ok) {
      await response.body?.cancel()
      return { ok: false, reason: `status-${response.status}` }
    }
    const declared = Number(response.headers.get("Content-Length") ?? "0")
    if (declared > maxPinnedLogoBytes) {
      await response.body?.cancel()
      return { ok: false, reason: "too-large" }
    }
    const bytes = await readCapped(response, maxPinnedLogoBytes)
    if (bytes === null) return { ok: false, reason: "too-large" }
    const contentType = sniffLogoType(bytes)
    if (contentType === null) return { ok: false, reason: "not-an-image" }
    return {
      ok: true,
      logo: {
        contentType,
        dataBase64: toBase64(bytes),
        sha256: await sha256Hex(bytes),
        sourceUrl: url,
      },
    }
  } catch {
    return { ok: false, reason: "fetch-failed" }
  }
}
