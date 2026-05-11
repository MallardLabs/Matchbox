import { PCVDebtPayment, PCVDistribution } from "../generated/PCV/PCV"
import {
  PCV,
  PCV_DEBT_PAYMENT,
  PCV_DISTRIBUTION,
  UNKNOWN,
  baseActivity,
  saveActivity,
} from "./helpers"

export function handlePcvDistribution(event: PCVDistribution): void {
  const activity = baseActivity(event, PCV_DISTRIBUTION, UNKNOWN, PCV)
  activity.recipient = event.params._recipient
  activity.amount = event.params._amount
  saveActivity(activity)
}

export function handlePcvDebtPayment(event: PCVDebtPayment): void {
  const activity = baseActivity(event, PCV_DEBT_PAYMENT, UNKNOWN, PCV)
  activity.amount = event.params._paidDebt
  saveActivity(activity)
}
