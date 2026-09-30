import type { EnvironmentKind } from "@repo/platform-contracts/network"
import { useParams, useSearch } from "@tanstack/react-router"

/** App id and selected environment kind for `/apps/$appId/*` tabs. */
export function useAppRoute(): { appId: string; kind: EnvironmentKind } {
  const { appId } = useParams({ from: "/_app/apps/$appId" })
  const { env } = useSearch({ from: "/_app/apps/$appId" })
  return { appId, kind: env ?? "test" }
}
