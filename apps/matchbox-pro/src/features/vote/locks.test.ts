import { describe, expect, it } from "vitest"
import {
  countdown,
  lockState,
  toVoteLock,
  unlockLabel,
  votingWindow,
} from "./locks"

const DAY = 86_400n
const NOW = 1_792_100_000n
const EPOCH_START = 1_792_022_400n
const EPOCH_NEXT = EPOCH_START + 7n * DAY

const base = {
  tokenId: 7n,
  votingPower: 10n ** 18n,
  end: NOW + 400n * DAY,
  isPermanent: false,
  managedBy: 0n,
  lastVoted: EPOCH_START - DAY,
}

describe("lock eligibility", () => {
  it("is votable with power, unexpired, and no vote this epoch", () => {
    expect(lockState(base, EPOCH_START, NOW)).toBe("votable")
  })

  it("labels a voted lock with when it can vote again", () => {
    const voted = { ...base, lastVoted: EPOCH_START + 10n }
    expect(toVoteLock(voted, EPOCH_START, NOW, EPOCH_NEXT).detail).toBe(
      `Voted · next in ${countdown(EPOCH_NEXT, NOW)}`,
    )
    expect(countdown(NOW + 2n * DAY + 14n * 3_600n, NOW)).toBe("2d 14h")
    expect(countdown(NOW + 17n * 3_600n + 14n * 60n, NOW)).toBe("17h 14m")
  })

  it("allows one vote per epoch per voter", () => {
    expect(
      lockState({ ...base, lastVoted: EPOCH_START + 10n }, EPOCH_START, NOW),
    ).toBe("voted")
  })

  it("separates expired, empty and managed locks", () => {
    expect(
      lockState({ ...base, end: NOW - 1n, votingPower: 0n }, EPOCH_START, NOW),
    ).toBe("expired")
    expect(lockState({ ...base, votingPower: 0n }, EPOCH_START, NOW)).toBe(
      "empty",
    )
    expect(
      toVoteLock(
        { ...base, votingPower: 0n, managedBy: 1226n },
        EPOCH_START,
        NOW,
      ).detail,
    ).toBe("Managed by #1226")
  })

  it("labels permanent locks and countdowns", () => {
    expect(
      toVoteLock({ ...base, isPermanent: true, end: 0n }, EPOCH_START, NOW)
        .detail,
    ).toBe("Auto max-locked")
    expect(unlockLabel(NOW + 487n * DAY, NOW)).toBe("Unlocks in 1y 4mo")
    expect(unlockLabel(NOW + 87n * DAY, NOW)).toBe("Unlocks in 2mo 27d")
    expect(unlockLabel(NOW + 3_600n, NOW)).toBe("Unlocks in 1d")
  })

  it("closes voting in the first and last hour of the epoch", () => {
    expect(votingWindow(EPOCH_START, EPOCH_NEXT, EPOCH_START + 60n)).toBe(
      "opens-soon",
    )
    expect(votingWindow(EPOCH_START, EPOCH_NEXT, NOW)).toBe("open")
    expect(votingWindow(EPOCH_START, EPOCH_NEXT, EPOCH_NEXT - 60n)).toBe(
      "closing",
    )
    expect(votingWindow(undefined, EPOCH_NEXT, NOW)).toBe("unknown")
  })
})
