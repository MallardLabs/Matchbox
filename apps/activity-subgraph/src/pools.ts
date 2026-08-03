import { PoolCreated } from "../generated/PoolFactory/PoolFactory"
import { Burn, Mint, Swap } from "../generated/templates/Pool/Pool"
import { Pool as PoolTemplate } from "../generated/templates"
import {
  baseActivity,
  LP_ADDED,
  LP_REMOVED,
  POOL,
  POOL_CREATED,
  POOL_FACTORY,
  saveActivity,
  SWAP,
  UNKNOWN,
} from "./helpers"

export function handlePoolCreated(event: PoolCreated): void {
  const activity = baseActivity(
    event,
    POOL_CREATED,
    UNKNOWN,
    POOL_FACTORY,
  )
  activity.actor = event.transaction.from
  activity.pool = event.params.pool
  activity.token = event.params.token0
  activity.recipient = event.params.token1
  activity.metadata = event.params.stable ? "stable" : "volatile"
  saveActivity(activity)

  PoolTemplate.create(event.params.pool)
}

export function handlePoolMint(event: Mint): void {
  const activity = baseActivity(event, LP_ADDED, UNKNOWN, POOL)
  // Prefer tx initiator (smart account / EOA) over internal sender (router).
  activity.actor = event.transaction.from
  activity.recipient = event.params.sender
  activity.pool = event.address
  activity.amount = event.params.amount0
  activity.firstRecipientAmount = event.params.amount0
  activity.secondRecipientAmount = event.params.amount1
  saveActivity(activity)
}

export function handlePoolBurn(event: Burn): void {
  const activity = baseActivity(event, LP_REMOVED, UNKNOWN, POOL)
  activity.actor = event.transaction.from
  activity.recipient = event.params.to
  activity.pool = event.address
  activity.amount = event.params.amount0
  activity.firstRecipientAmount = event.params.amount0
  activity.secondRecipientAmount = event.params.amount1
  saveActivity(activity)
}

export function handlePoolSwap(event: Swap): void {
  const activity = baseActivity(event, SWAP, UNKNOWN, POOL)
  activity.actor = event.transaction.from
  activity.recipient = event.params.to
  activity.pool = event.address
  // Net out amounts as primary display; both sides stored for dual-amount UI.
  const out0 = event.params.amount0Out
  const out1 = event.params.amount1Out
  activity.amount = out0.gt(out1) ? out0 : out1
  activity.firstRecipientAmount = event.params.amount0In.plus(out0)
  activity.secondRecipientAmount = event.params.amount1In.plus(out1)
  activity.metadata =
    "in0=" +
    event.params.amount0In.toString() +
    ",in1=" +
    event.params.amount1In.toString() +
    ",out0=" +
    out0.toString() +
    ",out1=" +
    out1.toString()
  saveActivity(activity)
}
