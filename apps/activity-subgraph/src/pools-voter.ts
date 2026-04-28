import {
  GaugeCreated,
  Voted,
} from "../generated/PoolsVoter/PoolsVoter"
import {
  baseActivity,
  BOOST_VOTE,
  GAUGE_CREATED,
  MATCHBOX_GAUGE_BOOST,
  POOLS_VOTER,
  saveActivity,
} from "./helpers"

export function handlePoolGaugeCreated(event: GaugeCreated): void {
  const activity = baseActivity(
    event,
    GAUGE_CREATED,
    MATCHBOX_GAUGE_BOOST,
    POOLS_VOTER,
  )
  activity.actor = event.params.creator
  activity.pool = event.params.pool
  activity.gauge = event.params.gauge
  activity.rewardContract = event.params.bribeVotingReward
  saveActivity(activity)
}

export function handlePoolVoted(event: Voted): void {
  const activity = baseActivity(
    event,
    BOOST_VOTE,
    MATCHBOX_GAUGE_BOOST,
    POOLS_VOTER,
  )
  activity.actor = event.params.voter
  activity.pool = event.params.pool
  activity.tokenId = event.params.tokenId
  activity.weight = event.params.weight
  activity.totalWeight = event.params.totalWeight
  saveActivity(activity)
}
