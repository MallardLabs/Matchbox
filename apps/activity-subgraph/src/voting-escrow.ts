import { Deposit } from "../generated/VeMEZO/VotingEscrow"
import {
  baseActivity,
  LOCK_AMOUNT_INCREASED,
  LOCK_CREATED,
  LOCK_EXTENDED,
  saveActivity,
  UNKNOWN,
  VOTING_ESCROW,
} from "./helpers"

const CREATE_LOCK_TYPE = 1
const INCREASE_LOCK_AMOUNT_TYPE = 2
const INCREASE_UNLOCK_TIME_TYPE = 3

export function handleVotingEscrowDeposit(event: Deposit): void {
  const depositType = event.params.depositType
  let actionType = LOCK_AMOUNT_INCREASED

  if (depositType == CREATE_LOCK_TYPE) {
    actionType = LOCK_CREATED
  } else if (depositType == INCREASE_UNLOCK_TIME_TYPE) {
    actionType = LOCK_EXTENDED
  } else if (depositType == INCREASE_LOCK_AMOUNT_TYPE) {
    actionType = LOCK_AMOUNT_INCREASED
  }

  const activity = baseActivity(event, actionType, UNKNOWN, VOTING_ESCROW)
  activity.actor = event.params.provider
  activity.tokenId = event.params.tokenId
  activity.amount = event.params.value
  activity.duration = event.params.locktime
  saveActivity(activity)
}
