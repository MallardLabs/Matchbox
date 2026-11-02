import { createLogger } from "@repo/shared/logger"
import type { HeadStatus } from "./ingest/ingest"

const logger = createLogger("matchbox-indexer")

// Three ticks of blocks: the webapp and Pro show warehouse data as stale
// after 45 minutes.
export const STALE_LAG_BLOCKS = 700n

export function isStale(status: HeadStatus): boolean {
  return status.lag === null || status.lag > STALE_LAG_BLOCKS
}

// A tick ends by pinging HEARTBEAT_URL (a dead man's switch such as a free
// healthchecks.io check) only while the warehouse is fresh. The monitor
// alerts when the pings stop, at no Neon cost: /health wakes the compute,
// so nothing polls it. Never throws; a failed ping only logs.
export async function sendHeartbeat(
  url: string | undefined,
  fetchImpl: typeof fetch = fetch.bind(globalThis),
): Promise<boolean> {
  if (!url) return false
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      signal: AbortSignal.timeout(5_000),
    })
    if (response.ok) return true
    logger.warn({ message: "Heartbeat ping refused", status: response.status })
  } catch (error) {
    logger.warn({
      message: "Heartbeat ping failed",
      error: error instanceof Error ? error.message : String(error),
    })
  }
  return false
}
