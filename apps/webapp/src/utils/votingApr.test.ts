import { strict as assert } from "node:assert"
import { test } from "node:test"

import { normalizeVotingAprPercent } from "./votingApr"

test("normalizeVotingAprPercent converts basis points to human percent", () => {
  assert.equal(normalizeVotingAprPercent(368), 3.68)
  assert.equal(normalizeVotingAprPercent(59), 0.59)
  assert.equal(normalizeVotingAprPercent(0), 0)
  assert.equal(normalizeVotingAprPercent(undefined), 0)
  assert.equal(normalizeVotingAprPercent(null), 0)
})
