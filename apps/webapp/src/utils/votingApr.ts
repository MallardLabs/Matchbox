export function normalizeVotingAprPercent(
  rawVotingApr: number | null | undefined,
): number {
  return (rawVotingApr ?? 0) / 100
}
