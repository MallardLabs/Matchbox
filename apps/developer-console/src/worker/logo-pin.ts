/**
 * Pins the app logo when a review is submitted. `logoUrl` is any HTTPS URL
 * the developer controls, so the bytes behind it can change, or differ per
 * requester. Staff review the pinned copy (never the live URL), the approval
 * names its SHA-256, and Matchbox ID shows a verified app's logo only from
 * that copy (`mbx_dev_verified_logos`); when the logo cannot be pinned, the
 * verified consent screen shows the app's initial instead.
 */

export const maxPinnedLogoBytes = 64 * 1024
/** One deadline for every hop and the body. */
export const logoFetchTimeoutMs = 5_000
export const maxLogoRedirects = 3

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

const privateSuffixes = [".localhost", ".local", ".internal", ".arpa"]

/**
 * Null when the Worker may fetch `url`: HTTPS on the default port, a dotted
 * DNS name (no IP literal, localhost or private-use suffix), no credentials.
 * Checked on every hop; `global_fetch_strictly_public` keeps same-zone
 * hostnames on the public path.
 */
export function logoUrlProblem(url: URL): string | null {
  if (url.protocol !== "https:") return "not-https"
  if (url.username !== "" || url.password !== "" || url.port !== "") {
    return "bad-host"
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, "")
  if (
    host.startsWith("[") ||
    /^[\d.]+$/.test(host) ||
    !host.includes(".") ||
    privateSuffixes.some((suffix) => host.endsWith(suffix))
  ) {
    return "bad-host"
  }
  return null
}

class DeadlineError extends Error {}

/** Rejects once `deadline` (epoch ms) passes; the caller cleans up. */
function beforeDeadline<T>(promise: Promise<T>, deadline: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new DeadlineError()),
      Math.max(0, deadline - Date.now()),
    )
  })
  return Promise.race([promise, expired]).finally(() => clearTimeout(timer))
}

/** Reads at most `limit` bytes by `deadline`; null when the body is longer. */
async function readCapped(
  response: Response,
  limit: number,
  deadline: number,
): Promise<Uint8Array | null> {
  if (response.body === null) return new Uint8Array()
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const { done, value } = await beforeDeadline(reader.read(), deadline)
      if (done) break
      size += value.byteLength
      if (size > limit) return null
      chunks.push(value)
    }
  } finally {
    reader.cancel().catch(() => undefined)
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

function isRedirect(status: number): boolean {
  return status >= 300 && status < 400
}

/**
 * Follows at most `maxLogoRedirects` redirects by hand, re-checking each
 * target; the final response, or a refusal reason.
 */
async function fetchFinal(
  fetchLogo: LogoFetch,
  start: URL,
  signal: AbortSignal,
  deadline: number,
): Promise<Response | string> {
  let current = start
  for (let hop = 0; ; hop += 1) {
    const problem = logoUrlProblem(current)
    if (problem !== null) return problem
    const response = await beforeDeadline(
      fetchLogo(current.href, {
        headers: { Accept: "image/png,image/jpeg,image/gif,image/webp" },
        redirect: "manual",
        signal,
      }),
      deadline,
    )
    if (!isRedirect(response.status)) return response
    await response.body?.cancel()
    const location = response.headers.get("Location")
    if (location === null || hop >= maxLogoRedirects) {
      return "too-many-redirects"
    }
    try {
      current = new URL(location, current)
    } catch {
      return "invalid-url"
    }
  }
}

/** Fetches and checks the logo; never throws. */
export async function pinLogo(
  fetchLogo: LogoFetch,
  url: string,
  timeoutMs = logoFetchTimeoutMs,
): Promise<PinLogoResult> {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return { ok: false, reason: "invalid-url" }
  }
  const controller = new AbortController()
  const deadline = Date.now() + timeoutMs
  try {
    const response = await fetchFinal(
      fetchLogo,
      parsed,
      controller.signal,
      deadline,
    )
    if (typeof response === "string") return { ok: false, reason: response }
    if (!response.ok) {
      await response.body?.cancel()
      return { ok: false, reason: `status-${response.status}` }
    }
    const declared = Number(response.headers.get("Content-Length") ?? "0")
    if (declared > maxPinnedLogoBytes) {
      await response.body?.cancel()
      return { ok: false, reason: "too-large" }
    }
    const bytes = await readCapped(response, maxPinnedLogoBytes, deadline)
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
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof DeadlineError ? "timeout" : "fetch-failed",
    }
  } finally {
    // Stops any hop or body still in flight after a refusal or deadline.
    controller.abort()
  }
}
