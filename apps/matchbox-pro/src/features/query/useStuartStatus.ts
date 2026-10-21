import { useQuery } from "@tanstack/react-query"
import { fetchStuartStatus } from "./client"
import type { StuartStatus } from "./contract"

/** GET /api/query/status: Claude vs tools-only, and whether reports can send. */
export default function useStuartStatus(): StuartStatus | null {
  const { data } = useQuery({
    queryKey: ["stuart-status"],
    queryFn: ({ signal }) => fetchStuartStatus(signal),
    staleTime: 60_000,
    retry: false,
  })
  return data ?? null
}
