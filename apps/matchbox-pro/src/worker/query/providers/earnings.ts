import type { WireEarnings } from "../../../features/history/schema"
import type { WaitUntil } from "../../router"

// The history worker answers a wallet within its own 7.5 s budget and marks
// the result `partial` when epoch prices are still loading; those reads keep
// running in the background. Stuart calls it in-process, so it waits for
// that background work and asks once more (settled prices come from the
// per-epoch memos) instead of showing a stale chip. Only a result that is
// still partial after that is reported as stale.

export const EARNINGS_SETTLE_MS = 8_000

export async function settledEarnings(
  load: (waitUntil: WaitUntil) => Promise<WireEarnings>,
  outer: WaitUntil,
  settleMs: number = EARNINGS_SETTLE_MS,
): Promise<WireEarnings> {
  const pending: Promise<unknown>[] = []
  const collect: WaitUntil = (promise) => {
    // Still handed to the request so it outlives a timed-out wait.
    outer(promise)
    pending.push(promise.catch(() => undefined))
  }
  const first = await load(collect)
  if (!first.partial || pending.length === 0) return first
  let timer: ReturnType<typeof setTimeout> | undefined
  await Promise.race([
    Promise.allSettled(pending),
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, settleMs)
    }),
  ])
  clearTimeout(timer)
  return load(collect)
}
