import { BLACKLISTED_SYSTEM_ACTORS } from "@/lib/academy/blacklistedActors"
import { useCallback, useEffect, useMemo, useState } from "react"
import { type Address, getAddress, isAddressEqual } from "viem"

const STORAGE_KEY = "mezo-academy-blacklist-v1"

export type AddResult =
  | { ok: true; address: Address }
  | { ok: false; reason: string }

export type UseBlacklistReturn = {
  seed: ReadonlyArray<Address>
  userAdditions: ReadonlyArray<Address>
  merged: ReadonlySet<Address>
  add: (raw: string) => AddResult
  remove: (addr: Address) => void
  isSeed: (addr: Address) => boolean
  hydrated: boolean
}

function readStored(): Address[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const out: Address[] = []
    for (const entry of parsed) {
      if (typeof entry !== "string") continue
      try {
        out.push(getAddress(entry))
      } catch {
        // Skip invalid entries silently — they'll be dropped from storage on
        // the next persist effect.
      }
    }
    return out
  } catch {
    return []
  }
}

export function useBlacklist(): UseBlacklistReturn {
  const [userAdditions, setUserAdditions] = useState<ReadonlyArray<Address>>([])
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setUserAdditions(readStored())
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(userAdditions))
    } catch {
      // Storage may be full or blocked; ignore.
    }
  }, [hydrated, userAdditions])

  const seed = BLACKLISTED_SYSTEM_ACTORS

  const merged = useMemo(() => {
    const set = new Set<Address>()
    for (const entry of seed) set.add(entry)
    for (const entry of userAdditions) set.add(entry)
    return set as ReadonlySet<Address>
  }, [seed, userAdditions])

  const isSeed = useCallback(
    (addr: Address) => seed.some((entry) => isAddressEqual(entry, addr)),
    [seed],
  )

  const add = useCallback(
    (raw: string): AddResult => {
      const trimmed = raw.trim()
      if (!trimmed) return { ok: false, reason: "Address is required" }
      let address: Address
      try {
        address = getAddress(trimmed)
      } catch {
        return { ok: false, reason: "Invalid address" }
      }
      if (seed.some((entry) => isAddressEqual(entry, address))) {
        return { ok: false, reason: "Already in seed list" }
      }
      if (userAdditions.some((entry) => isAddressEqual(entry, address))) {
        return { ok: false, reason: "Already added" }
      }
      setUserAdditions((prev) => [...prev, address])
      return { ok: true, address }
    },
    [seed, userAdditions],
  )

  const remove = useCallback(
    (addr: Address) => {
      if (seed.some((entry) => isAddressEqual(entry, addr))) return
      setUserAdditions((prev) =>
        prev.filter((entry) => !isAddressEqual(entry, addr)),
      )
    },
    [seed],
  )

  return { seed, userAdditions, merged, add, remove, isSeed, hydrated }
}
