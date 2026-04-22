import type { GaugeProfile } from "@/config/supabase"
import type { StandaloneVotableSummary } from "@/hooks/useVotables"
import type { VoteableTargetMetadata } from "@/hooks/useVoteableTargetMetadata"

export type VoteableDisplayMetadata = {
  name?: string
  symbol?: string
}

export type StandaloneVoteablePresentation = {
  iconSymbol: string
  subtitle: string
  targetLabel: string
  title: string
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function shortAddress(value: string): string {
  return `${value.slice(0, 6)}...${value.slice(-4)}`
}

export function normalizeVoteableTargetMetadata(
  metadata: VoteableTargetMetadata | undefined,
): VoteableDisplayMetadata {
  const name = metadata?.name?.trim()
  const symbol = metadata?.symbol?.trim()
  const lowerName = name?.toLowerCase()

  if (symbol === "sMUSD" || lowerName === "musd savings rate") {
    return {
      name: "Savings MUSD Vault",
      symbol: "MUSD",
    }
  }

  return {
    ...(name ? { name } : {}),
    ...(symbol ? { symbol } : {}),
  }
}

export function getStandaloneVoteablePresentation(args: {
  voteable: StandaloneVotableSummary
  metadata: VoteableTargetMetadata | undefined
  profile: GaugeProfile | null | undefined
}): StandaloneVoteablePresentation {
  const { voteable, metadata, profile } = args
  const normalized = normalizeVoteableTargetMetadata(metadata)
  const targetLabel = titleCase(voteable.targetType)

  return {
    title:
      profile?.display_name ??
      normalized.name ??
      `${targetLabel} ${shortAddress(voteable.targetId)}`,
    subtitle:
      profile?.description ??
      normalized.symbol ??
      `${targetLabel} target on Matchbox`,
    iconSymbol: normalized.symbol ?? targetLabel,
    targetLabel,
  }
}
