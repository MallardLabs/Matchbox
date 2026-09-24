import { strict as assert } from "node:assert"
import { test } from "node:test"

import { WEEK } from "../academy/epoch"
import { LAUNCH_EPOCH_START } from "./constants"
import {
  epochClosesSinceLaunch,
  epochIndexFor,
  rewardedVoteEpochFor,
  voteWindowCloseFor,
} from "./epochs"

test("voteWindowCloseFor closes Wed 23:00 UTC", () => {
  assert.equal(voteWindowCloseFor(1_788_393_600), 1_788_994_800)
  assert.equal(voteWindowCloseFor(1_788_393_600 + WEEK), 1_789_599_600)
  assert.equal(voteWindowCloseFor(1_788_393_600 + 2 * WEEK), 1_790_204_400)
})

test("epochIndexFor numbers E0 from launch", () => {
  assert.equal(epochIndexFor(LAUNCH_EPOCH_START), 0)
  assert.equal(epochIndexFor(LAUNCH_EPOCH_START + WEEK), 1)
  assert.equal(epochIndexFor(LAUNCH_EPOCH_START + 2 * WEEK), 2)
})

test("rewardedVoteEpochFor attributes flip-time distributions to the prior vote epoch", () => {
  // E1 starts 1_788_998_400 (10 Sep); the 10 Sep 00:19 distribution pays
  // for E0's votes.
  const e1Start = LAUNCH_EPOCH_START + WEEK
  assert.equal(rewardedVoteEpochFor(e1Start + 1_140), LAUNCH_EPOCH_START)
  assert.equal(rewardedVoteEpochFor(e1Start + 2 * WEEK), e1Start + WEEK)
})

test("epochClosesSinceLaunch excludes the open epoch", () => {
  // Before E0 closes: nothing
  assert.deepEqual(epochClosesSinceLaunch(1_788_994_799), [])
  // Exactly at E0 close: [E0 close]
  assert.deepEqual(epochClosesSinceLaunch(1_788_994_800), [1_788_994_800])
  // Mid E1: still only E0's close
  assert.deepEqual(epochClosesSinceLaunch(1_789_000_000), [1_788_994_800])
  // After E1 close: both
  assert.deepEqual(
    epochClosesSinceLaunch(1_789_599_600),
    [1_788_994_800, 1_789_599_600],
  )
})
