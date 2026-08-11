import { type QueryResponse, queryResponseSchema } from "@/lib/query/contracts"

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
