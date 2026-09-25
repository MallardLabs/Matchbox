export type MezoGaugeUnpairLockState = {
  tokenId: bigint
  votedThisEpoch: boolean | undefined
  usedWeight: bigint | undefined
  hasCatalogAllocations: boolean
}

export type MezoGaugeUnpairEligibility = {
  unpairableTokenIds: bigint[]
  blockedMessage: string | null
}

export function resolveMezoGaugeUnpairEligibility(input: {
  selectedCount: number
  isLoading: boolean
  isInVotingWindow: boolean
  locks: readonly MezoGaugeUnpairLockState[]
}): MezoGaugeUnpairEligibility {
  if (input.selectedCount === 0) {
    return {
      unpairableTokenIds: [],
      blockedMessage:
        "Select veMEZO locks to unpair prior MEZO Gauges allocations.",
    }
  }

  if (input.isLoading) {
    return {
      unpairableTokenIds: [],
      blockedMessage: "Checking unpair eligibility...",
    }
  }

  const unpairableTokenIds: bigint[] = []
  let alreadyVotedCount = 0
  let noAllocationCount = 0
  let windowClosedCount = 0
  let unknownStateCount = 0

  for (const lock of input.locks) {
    const hasWeight = lock.usedWeight !== undefined && lock.usedWeight > 0n
    if (!hasWeight && !lock.hasCatalogAllocations) {
      noAllocationCount += 1
      continue
    }
    if (lock.votedThisEpoch === undefined) {
      unknownStateCount += 1
      continue
    }
    if (lock.votedThisEpoch) {
      alreadyVotedCount += 1
      continue
    }
    if (!input.isInVotingWindow) {
      windowClosedCount += 1
      continue
    }
    unpairableTokenIds.push(lock.tokenId)
  }

  if (unpairableTokenIds.length === 0) {
    if (unknownStateCount > 0) {
      return {
        unpairableTokenIds,
        blockedMessage: "Checking unpair eligibility...",
      }
    }
    if (alreadyVotedCount > 0) {
      return {
        unpairableTokenIds,
        blockedMessage:
          "Selected locks already voted this epoch, so unpairing is blocked.",
      }
    }
    if (windowClosedCount > 0) {
      return {
        unpairableTokenIds,
        blockedMessage: "Unpairing is only available during the voting window.",
      }
    }
    return {
      unpairableTokenIds,
      blockedMessage:
        "Selected locks have no prior MEZO Gauges allocations to unpair.",
    }
  }

  if (
    alreadyVotedCount > 0 ||
    windowClosedCount > 0 ||
    noAllocationCount > 0 ||
    unknownStateCount > 0
  ) {
    return {
      unpairableTokenIds,
      blockedMessage: `${unpairableTokenIds.length} selected lock${
        unpairableTokenIds.length === 1 ? "" : "s"
      } eligible to unpair. Ineligible locks will be skipped.`,
    }
  }

  return { unpairableTokenIds, blockedMessage: null }
}
