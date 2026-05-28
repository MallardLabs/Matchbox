import {
  EmissionsEnabled,
  EpochProcessed,
} from "../generated/MezoMinter/MezoMinter"
import {
  EMISSIONS_ENABLED,
  EPOCH_PROCESSED,
  MEZO_MINTER,
  UNKNOWN,
  baseActivity,
  saveActivity,
} from "./helpers"

export function handleEpochProcessed(event: EpochProcessed): void {
  const activity = baseActivity(event, EPOCH_PROCESSED, UNKNOWN, MEZO_MINTER)
  activity.actor = event.params.caller
  activity.period = event.params.period
  activity.epochIndex = event.params.epochIndex
  activity.emission = event.params.emission
  activity.rebase = event.params.rebase
  activity.rewards = event.params.rewards
  activity.totalSupply = event.params.totalSupply
  saveActivity(activity)
}

export function handleEmissionsEnabled(event: EmissionsEnabled): void {
  const activity = baseActivity(event, EMISSIONS_ENABLED, UNKNOWN, MEZO_MINTER)
  activity.period = event.params.activePeriod
  saveActivity(activity)
}
