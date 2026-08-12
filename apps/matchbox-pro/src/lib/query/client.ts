import { type QueryResponse, queryResponseSchema } from "@/lib/query/contracts"
import {
  type RefreshProposalInput,
  type RefreshProposalResult,
  refreshProposalResultSchema,
} from "@repo/matchbox-mcp"

export async function runQuery(input: {
  query: string
  wallet?: {
    address: string
    mode: "connected" | "watching" | "inspecting"
    label?: string
  }
}): Promise<QueryResponse> {
  const response = await fetch("/api/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  const body: unknown = await response.json()
  if (!response.ok) throw new Error("Stuart could not answer this Query")
  return queryResponseSchema.parse(body)
}

export async function refreshProposal(
  input: RefreshProposalInput,
): Promise<RefreshProposalResult> {
  const response = await fetch("/api/proposal/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  const body: unknown = await response.json()
  if (!response.ok) throw new Error("Stuart could not refresh this proposal")
  return refreshProposalResultSchema.parse(body)
}
