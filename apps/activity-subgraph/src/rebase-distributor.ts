import {
  CheckpointToken,
  Claimed,
} from "../generated/MezoRebaseDistributor/RebaseDistributor"
import {
  MEZO_REBASE_DISTRIBUTOR,
  REBASE_CHECKPOINT,
  REBASE_CLAIMED,
  UNKNOWN,
  baseActivity,
  saveActivity,
} from "./helpers"

export function handleRebaseClaimed(event: Claimed): void {
  const activity = baseActivity(
    event,
    REBASE_CLAIMED,
    UNKNOWN,
    MEZO_REBASE_DISTRIBUTOR,
  )
  activity.tokenId = event.params.tokenId
  activity.epochStart = event.params.epochStart
  activity.epochEnd = event.params.epochEnd
  activity.amount = event.params.amount
  saveActivity(activity)
}

export function handleCheckpointToken(event: CheckpointToken): void {
  const activity = baseActivity(
    event,
    REBASE_CHECKPOINT,
    UNKNOWN,
    MEZO_REBASE_DISTRIBUTOR,
  )
  activity.period = event.params.time
  activity.amount = event.params.tokens
  saveActivity(activity)
}
