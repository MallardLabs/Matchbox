import { useCallback, useEffect, useState } from "react"
import { z } from "zod"
import type { Ballot } from "./ballot"
import type { VoteType } from "./model"
import type { AllocationSnapshot } from "./optimize"

// The ballot survives a trip to gauge detail and back (the route unmounts),
// but only for this tab: sessionStorage, keyed by network, wallet and branch.
const STORAGE_PREFIX = "matchbox-pro:vote:v1"

const bigintString = z
  .string()
  .regex(/^-?\d+$/)
  .transform((value) => BigInt(value))

const storedSchema = z.object({
  ballot: z.array(z.object({ id: z.string(), bps: z.number().int().min(0) })),
  edited: z.boolean(),
  optimum: z
    .object({
      entries: z.array(
        z.object({
          id: z.string(),
          bps: z.number().int(),
          projectedMicroUsd: bigintString,
        }),
      ),
      projectedMicroUsd: bigintString,
    })
    .nullable(),
  picked: z.array(z.string()).nullable(),
})

export type BallotState = {
  ballot: Ballot
  /** Manual edits since the last optimize; a pre-sign refresh never overwrites them. */
  edited: boolean
  /** Optimizer result the ballot came from, for the pre-sign diff. */
  optimum: AllocationSnapshot | null
  /** Explicit lock choice; null means every votable lock. */
  picked: string[] | null
}

const EMPTY: BallotState = {
  ballot: [],
  edited: false,
  optimum: null,
  picked: null,
}

function storageKey(chainId: number, viewer: string, type: VoteType): string {
  return `${STORAGE_PREFIX}:${chainId}:${viewer.toLowerCase()}:${type}`
}

function read(key: string): BallotState {
  try {
    const raw = window.sessionStorage.getItem(key)
    if (!raw) return EMPTY
    const parsed = storedSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : EMPTY
  } catch {
    return EMPTY
  }
}

function write(key: string, state: BallotState): void {
  try {
    window.sessionStorage.setItem(
      key,
      JSON.stringify(state, (_, value: unknown) =>
        typeof value === "bigint" ? value.toString() : value,
      ),
    )
  } catch {
    // Storage blocked: the ballot still works for this page view.
  }
}

export function useBallotStore(
  chainId: number,
  viewer: string | undefined,
  type: VoteType,
): [BallotState, (update: (previous: BallotState) => BallotState) => void] {
  const key = storageKey(chainId, viewer ?? "anonymous", type)
  const [entry, setEntry] = useState(() => ({ key, state: read(key) }))
  const state = entry.key === key ? entry.state : read(key)

  useEffect(() => {
    if (entry.key !== key) setEntry({ key, state: read(key) })
  }, [entry.key, key])

  const update = useCallback(
    (fn: (previous: BallotState) => BallotState) => {
      setEntry((previous) => {
        const base = previous.key === key ? previous.state : read(key)
        const next = fn(base)
        write(key, next)
        return { key, state: next }
      })
    },
    [key],
  )

  return [state, update]
}
