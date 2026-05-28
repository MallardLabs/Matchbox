import { Nudge, PeriodUpdated } from "../generated/ChainFeeSplitter/Splitter"
import {
  CHAIN_FEE_SPLITTER,
  MEZO_CHAIN_SPLITTER,
  MEZO_ECOSYSTEM_SPLITTER,
  PERIOD_UPDATED,
  UNKNOWN,
  baseActivity,
  saveActivity,
} from "./helpers"

function handlePeriodUpdated(event: PeriodUpdated, source: string): void {
  const activity = baseActivity(event, PERIOD_UPDATED, UNKNOWN, source)
  activity.period = event.params.oldPeriod
  activity.newPeriod = event.params.newPeriod
  activity.firstRecipientAmount = event.params.firstRecipientAmount
  activity.secondRecipientAmount = event.params.secondRecipientAmount
  saveActivity(activity)
}

function handleNudge(event: Nudge, source: string): void {
  const activity = baseActivity(event, PERIOD_UPDATED, UNKNOWN, source)
  activity.period = event.params._period
  activity.oldRate = event.params._oldRate
  activity.newRate = event.params._newRate
  saveActivity(activity)
}

export function handleChainFeePeriodUpdated(event: PeriodUpdated): void {
  handlePeriodUpdated(event, CHAIN_FEE_SPLITTER)
}
export function handleChainFeeNudge(event: Nudge): void {
  handleNudge(event, CHAIN_FEE_SPLITTER)
}
export function handleMezoChainPeriodUpdated(event: PeriodUpdated): void {
  handlePeriodUpdated(event, MEZO_CHAIN_SPLITTER)
}
export function handleMezoChainNudge(event: Nudge): void {
  handleNudge(event, MEZO_CHAIN_SPLITTER)
}
export function handleMezoEcosystemPeriodUpdated(event: PeriodUpdated): void {
  handlePeriodUpdated(event, MEZO_ECOSYSTEM_SPLITTER)
}
export function handleMezoEcosystemNudge(event: Nudge): void {
  handleNudge(event, MEZO_ECOSYSTEM_SPLITTER)
}
