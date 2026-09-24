import { WEEK, epochStartFor } from "../academy/epoch"
import {
  LAUNCH_EPOCH_START,
  VOTE_WINDOW_CLOSE_OFFSET_SECONDS,
} from "./constants"

/** Epoch vote windows close 1h before the next epoch starts (Wed 23:00 UTC). */
export function voteWindowCloseFor(epochStart: number): number {
  return epochStart + VOTE_WINDOW_CLOSE_OFFSET_SECONDS
}

/** E0 is the epoch starting at LAUNCH_EPOCH_START. */
export function epochIndexFor(epochStart: number): number {
  return Math.floor((epochStart - LAUNCH_EPOCH_START) / WEEK)
}

/**
 * Vote-window closes that have passed since launch, i.e. every epoch from E0
 * whose close is <= nowTs. The currently open epoch is excluded.
 */
export function epochClosesSinceLaunch(nowTs: number): number[] {
  const closes: number[] = []
  for (
    let epochStart = LAUNCH_EPOCH_START;
    voteWindowCloseFor(epochStart) <= nowTs;
    epochStart += WEEK
  ) {
    closes.push(voteWindowCloseFor(epochStart))
  }
  return closes
}

/**
 * Rewards distribute at the epoch flip: a distribution event at `timestamp`
 * lands in epoch N+1's first blocks but pays for epoch N's votes. Returns the
 * vote epoch the payout belongs to.
 */
export function rewardedVoteEpochFor(timestamp: number): number {
  return epochStartFor(timestamp) - WEEK
}

export { epochStartFor, WEEK }
