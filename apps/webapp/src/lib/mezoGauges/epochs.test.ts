import { strict as assert } from "node:assert"
import { test } from "node:test"

import { WEEK } from "../academy/epoch"
import { LAUNCH_EPOCH_START } from "./constants"
import {
  epochClosesSinceLaunch,
  epochIndexFor,
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
