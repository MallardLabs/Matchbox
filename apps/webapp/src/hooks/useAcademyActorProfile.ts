import type { ActorProfile } from "@/lib/academy/actorProfile"
import type { LeaderboardRow } from "@/lib/academy/simulate"
import { useQuery } from "@tanstack/react-query"
import type { Address } from "viem"

export type AcademyActorProfileData = {
  profile: ActorProfile
  row: LeaderboardRow | null
}

export function useAcademyActorProfile(
  _actor: Address | null,
  _windowOverride?: { fromTs: number; toTs: number } | null,
) {
  return useQuery<AcademyActorProfileData>({
    queryKey: ["academy-actor-profile", "disabled"],
    enabled: false,
    queryFn: () => Promise.reject(new Error("indexed academy is off")),
  })
}
