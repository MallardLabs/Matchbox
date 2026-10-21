// Bounded-concurrency reads with jittered exponential backoff, for public RPCs
// that rate-limit (Base answers 429 past ~25 calls/s). Pure apart from the
// injected clock, so tests can drive it without waiting.

export type RetryPolicy = {
  /** Total tries per item, including the first. */
  attempts: number
  /** Reads in flight at once. */
  concurrency: number
  /** Delay before retry n is baseDelayMs·2^(n-1) plus up to jitterMs. */
  baseDelayMs: number
  jitterMs: number
}

/** A read's outcome: `retry: true` means a transient miss worth retrying. */
export type Attempt<T> = { value: T; retry: boolean }

export type RetryDeps = {
  sleep: (ms: number) => Promise<void>
  random: () => number
}

const realDeps: RetryDeps = {
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  random: Math.random,
}

export function backoffMs(
  policy: RetryPolicy,
  retry: number,
  random: () => number,
): number {
  return (
    policy.baseDelayMs * 2 ** (retry - 1) +
    Math.floor(random() * policy.jitterMs)
  )
}

/**
 * Runs `read` for every item, at most `concurrency` at a time, retrying
 * transient misses with backoff. Returns each item's last outcome, so the
 * caller can tell settled values from ones that never came back.
 */
export async function readEach<I, T>(
  items: readonly I[],
  read: (item: I) => Promise<Attempt<T>>,
  policy: RetryPolicy,
  deps: RetryDeps = realDeps,
): Promise<Array<Attempt<T>>> {
  const results = new Array<Attempt<T>>(items.length)
  // Workers share one iterator, so each item is read by exactly one worker.
  const queue = items.entries()
  async function worker(): Promise<void> {
    for (const [index, item] of queue) {
      let outcome = await read(item)
      for (
        let retry = 1;
        outcome.retry && retry < policy.attempts;
        retry += 1
      ) {
        await deps.sleep(backoffMs(policy, retry, deps.random))
        outcome = await read(item)
      }
      results[index] = outcome
    }
  }
  const workers = Math.max(1, Math.min(policy.concurrency, items.length))
  await Promise.all(Array.from({ length: workers }, () => worker()))
  return results
}
