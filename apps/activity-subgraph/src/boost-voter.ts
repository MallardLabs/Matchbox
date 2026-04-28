import {
  BoostPoked,
  GaugeCreated,
  Voted,
} from "../generated/BoostVoter/BoostVoter"
import {
  baseActivity,
  BOOST_POKE,
  BOOST_VOTE,
  BOOST_VOTER,
  MEZO_VEBTC_PAIR_BOOST,
  PAIR_CREATED,
  saveActivity,
} from "./helpers"

export function handleBoostGaugeCreated(event: GaugeCreated): void {
  const activity = baseActivity(
    event,
    PAIR_CREATED,
    MEZO_VEBTC_PAIR_BOOST,
    BOOST_VOTER,
  )
  activity.actor = event.params.creator
  activity.gauge = event.params.gauge
  activity.rewardContract = event.params.bribeVotingReward
  saveActivity(activity)
}

export function handleBoostVoted(event: Voted): void {
  const activity = baseActivity(
    event,
    BOOST_VOTE,
    MEZO_VEBTC_PAIR_BOOST,
    BOOST_VOTER,
  )
  activity.actor = event.params.voter
  activity.gauge = event.params.gauge
  activity.tokenId = event.params.tokenId
  activity.weight = event.params.weight
  activity.totalWeight = event.params.totalWeight
  saveActivity(activity)
}

export function handleBoostPoked(event: BoostPoked): void {
  const activity = baseActivity(
    event,
    BOOST_POKE,
    MEZO_VEBTC_PAIR_BOOST,
    BOOST_VOTER,
  )
  activity.boostableTokenId = event.params.boostableTokenId
  activity.boost = event.params.boost
  saveActivity(activity)
}
