import type { MezoActivityItem } from "@/types/mezoActivity"

// Shared lock-track Δve calculator used by both the leaderboard simulator
// and the per-actor profile drawer. Every lock-track event encodes a state
// transition (prevAmount, prevDuration, prevIsPermanent → postAmount,
// postDuration, postIsPermanent). We split the Δve into two buckets:
//
//   • Amount-added piece — newly locked MEZO at the post-event duration.
//     Credited at `weightNew`. For LOCK_MERGED this is zero: the source NFT's
//     MEZO was already locked; the user is *not* adding new capital.
//
//   • Duration-extended piece — the prev-amount's ve-power gain from time
//     extension. Credited at `weightExt`. Covers LOCK_EXTENDED, the
//     1y→4y portion of LOCK_PERMANENT, and the source-NFT extension portion
//     of LOCK_MERGED.
//
// For LOCK_MERGED the dest NFT may also see an extension on its existing
// amount (when source.unlockAt > dest.unlockAt and dest is non-permanent).
// That piece is added to the extension bucket via the mergeDestPrev* fields.

export const MAXTIME = BigInt(4 * 365 * 86_400)
const ZERO = 0n

export type LockSnapshot = {
  amount: bigint
  // Effective remaining seconds at event time. MAXTIME for permanent.
  durationEff: bigint
  isPermanent: boolean
}

export type LockTrackDelta = {
  // Sub-components in wad. Multiply by weightNew / weightExt respectively
  // and sum for total points (lock-track + extension-track).
  amountAddedVeWad: bigint
  durationExtendedVeWad: bigint
  // True if any side of the calculation fell back to a heuristic because
  // pre-state wasn't available. UI uses this to surface a ~ marker.
  flagged: boolean
}

export function vePowerWad(amount: bigint, duration: bigint): bigint {
  if (duration <= ZERO || amount <= ZERO) return ZERO
  const capped = duration > MAXTIME ? MAXTIME : duration
  return (amount * capped) / MAXTIME
}

export function effectiveDuration(
  duration: bigint | undefined,
  isPermanent: boolean | undefined,
): bigint {
  if (isPermanent) return MAXTIME
  return duration ?? ZERO
}

// Read the subgraph-emitted prev snapshot from an event. Returns null if
// the event predates the schema migration that added the prev* fields.
export function readPrevSnapshot(ev: MezoActivityItem): LockSnapshot | null {
  if (ev.prevAmount === undefined || ev.prevDuration === undefined) {
    return null
  }
  return {
    amount: ev.prevAmount,
    durationEff: effectiveDuration(ev.prevDuration, ev.prevIsPermanent),
    isPermanent: ev.prevIsPermanent ?? false,
  }
}

export function readPostSnapshot(ev: MezoActivityItem): LockSnapshot | null {
  if (ev.postAmount === undefined || ev.postDuration === undefined) {
    return null
  }
  return {
    amount: ev.postAmount,
    durationEff: effectiveDuration(ev.postDuration, ev.postIsPermanent),
    isPermanent: ev.postIsPermanent ?? false,
  }
}

export function readMergeDestPrevSnapshot(
  ev: MezoActivityItem,
): LockSnapshot | null {
  if (
    ev.mergeDestPrevAmount === undefined ||
    ev.mergeDestPrevDuration === undefined
  ) {
    return null
  }
  return {
    amount: ev.mergeDestPrevAmount,
    durationEff: effectiveDuration(
      ev.mergeDestPrevDuration,
      ev.mergeDestPrevIsPermanent,
    ),
    isPermanent: ev.mergeDestPrevIsPermanent ?? false,
  }
}

// Compute the Δve for a single lock-track event. `fallbackPrev` is used for
// legacy data where the subgraph doesn't yet emit prev/post fields — pass
// the simulator's per-token last-state cache. For new data (with prev/post
// populated) the fallback is ignored.
export function computeLockTrackDelta(
  ev: MezoActivityItem,
  fallbackPrev: LockSnapshot | null,
): LockTrackDelta {
  const post = readPostSnapshot(ev)
  let prev = readPrevSnapshot(ev)
  let flagged = false

  if (!post) {
    // Legacy path — reconstruct as best we can from event fields. The
    // pre-migration subgraph stored `duration` as an absolute timestamp,
    // so vePowerWad's cap saturates → credits MAXTIME for every event.
    // We preserve that behaviour rather than silently re-credit old data.
    return legacyLockTrackDelta(ev, fallbackPrev)
  }

  if (!prev) {
    if (fallbackPrev) {
      prev = fallbackPrev
    } else if (ev.actionType === "lockCreated") {
      prev = { amount: ZERO, durationEff: ZERO, isPermanent: false }
    } else {
      // No prior state and not a fresh lock — heuristic: credit half the
      // post-state at extension weight. Flagged so the UI shows ~.
      flagged = true
      prev = {
        amount: post.amount,
        durationEff: post.durationEff / 2n,
        isPermanent: false,
      }
    }
  }

  const destPrev = readMergeDestPrevSnapshot(ev)

  // Source-side delta: the prev.amount goes from prev.durationEff →
  // post.durationEff. For LOCK_MERGED this is the source NFT's MEZO being
  // re-locked at the dest's duration.
  const sourceAmount = prev.amount
  const sourcePrevVe = vePowerWad(sourceAmount, prev.durationEff)
  const sourcePostVe = vePowerWad(sourceAmount, post.durationEff)
  const sourceExtension =
    sourcePostVe > sourcePrevVe ? sourcePostVe - sourcePrevVe : ZERO

  let amountAddedVe = ZERO
  let durationExtendedVe = sourceExtension

  if (ev.actionType === "lockMerged") {
    // Dest-side extension: if dest.unlockAt was earlier than the new
    // post.duration, the dest's existing amount also got extended.
    if (destPrev) {
      const destPrevVe = vePowerWad(destPrev.amount, destPrev.durationEff)
      const destPostVe = vePowerWad(destPrev.amount, post.durationEff)
      const destExtension =
        destPostVe > destPrevVe ? destPostVe - destPrevVe : ZERO
      durationExtendedVe += destExtension
    }
    // Merges don't add new capital — the source's amount was already locked.
    amountAddedVe = ZERO
  } else {
    // Amount-added piece: newly locked MEZO at the post-event duration.
    // Use post.amount − prev.amount, but reduce to zero on withdrawals
    // (we only ever credit positive ve gains here; withdrawals don't earn).
    const amountAdded =
      post.amount > prev.amount ? post.amount - prev.amount : ZERO
    amountAddedVe = vePowerWad(amountAdded, post.durationEff)
  }

  return {
    amountAddedVeWad: amountAddedVe,
    durationExtendedVeWad: durationExtendedVe,
    flagged,
  }
}

// Legacy compute for events that predate the prev/post schema migration.
// The original subgraph stored `activity.duration` as an absolute unlock
// timestamp (not a remaining duration), so `vePowerWad(amount, duration)`
// always saturates to MAXTIME and over-credits non-permanent locks. We
// reproduce that behaviour here so old data doesn't suddenly re-score.
function legacyLockTrackDelta(
  ev: MezoActivityItem,
  fallbackPrev: LockSnapshot | null,
): LockTrackDelta {
  const amount = ev.amount ?? ZERO
  const duration = ev.duration ?? ZERO
  if (
    ev.actionType === "lockCreated" ||
    ev.actionType === "lockAmountIncreased" ||
    ev.actionType === "lockPermanent"
  ) {
    return {
      amountAddedVeWad: vePowerWad(amount, duration),
      durationExtendedVeWad: ZERO,
      flagged: false,
    }
  }
  if (ev.actionType === "lockExtended") {
    if (fallbackPrev) {
      const newAmount = amount > ZERO ? amount : fallbackPrev.amount
      const prevPower = vePowerWad(
        fallbackPrev.amount,
        fallbackPrev.durationEff,
      )
      const newPower = vePowerWad(newAmount, duration)
      return {
        amountAddedVeWad: ZERO,
        durationExtendedVeWad:
          newPower > prevPower ? newPower - prevPower : ZERO,
        flagged: false,
      }
    }
    return {
      amountAddedVeWad: ZERO,
      durationExtendedVeWad: vePowerWad(amount, duration) / 4n,
      flagged: true,
    }
  }
  return {
    amountAddedVeWad: ZERO,
    durationExtendedVeWad: ZERO,
    flagged: false,
  }
}

// Update a per-token snapshot cache after processing an event. Used by the
// simulator to remember prior state for events that don't carry prev fields.
export function snapshotAfter(
  ev: MezoActivityItem,
  prior: LockSnapshot | null,
): LockSnapshot | null {
  const post = readPostSnapshot(ev)
  if (post) return post
  // Legacy fallback — derive from event fields.
  if (
    ev.actionType === "lockCreated" ||
    ev.actionType === "lockAmountIncreased" ||
    ev.actionType === "lockPermanent"
  ) {
    return {
      amount: ev.amount ?? prior?.amount ?? ZERO,
      durationEff: ev.duration ?? prior?.durationEff ?? ZERO,
      isPermanent: ev.actionType === "lockPermanent",
    }
  }
  if (ev.actionType === "lockExtended") {
    return {
      amount: ev.amount ?? prior?.amount ?? ZERO,
      durationEff: ev.duration ?? ZERO,
      isPermanent: prior?.isPermanent ?? false,
    }
  }
  return prior
}
