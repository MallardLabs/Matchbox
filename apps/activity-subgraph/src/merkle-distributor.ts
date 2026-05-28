import {
  Claimed,
  DistributionAdded,
} from "../generated/MezoMerkleDistributor/MerkleDistributor"
import {
  MERKLE_CLAIMED,
  MERKLE_DISTRIBUTION_ADDED,
  MEZO_MERKLE_DISTRIBUTOR,
  UNKNOWN,
  baseActivity,
  saveActivity,
} from "./helpers"

export function handleMerkleClaimed(event: Claimed): void {
  const activity = baseActivity(
    event,
    MERKLE_CLAIMED,
    UNKNOWN,
    MEZO_MERKLE_DISTRIBUTOR,
  )
  activity.actor = event.params.account
  activity.distributionId = event.params.distributionId
  activity.amount = event.params.amount
  activity.epochIndex = event.params.index
  saveActivity(activity)
}

export function handleDistributionAdded(event: DistributionAdded): void {
  const activity = baseActivity(
    event,
    MERKLE_DISTRIBUTION_ADDED,
    UNKNOWN,
    MEZO_MERKLE_DISTRIBUTOR,
  )
  activity.distributionId = event.params.distributionId
  activity.merkleRoot = event.params.merkleRoot
  activity.epochStart = event.params.startTimestamp
  activity.recipient = event.params.handler
  saveActivity(activity)
}
