import QueryPage from "@/features/query/QueryPage"
import { createFileRoute } from "@tanstack/react-router"
import type { ReactElement } from "react"
import { z } from "zod"

const querySearchSchema = z.object({
  q: z.string().trim().min(1).max(2_000).optional().catch(undefined),
  r: z.string().max(80).optional().catch(undefined),
  // Kept so a watched wallet survives reloads of /query?r=.
  watch: z.string().max(64).optional().catch(undefined),
})

export const Route = createFileRoute("/query")({
  validateSearch: querySearchSchema,
  component: QueryRoute,
})

function QueryRoute(): ReactElement {
  const { q, r } = Route.useSearch()
  return <QueryPage q={q} r={r} />
}
