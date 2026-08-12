import type { QueryBlock, QueryResponse } from "./contracts"

export function appendSessionResponse(
  thread: QueryResponse[],
  response: QueryResponse,
): QueryResponse[] {
  return [...thread, response]
}

export function richSessionBlocks(thread: QueryResponse[]): QueryBlock[] {
  return thread.flatMap((response) =>
    response.blocks.filter(
      (block) =>
        block.type !== "activity_trace" &&
        block.type !== "clarification_card" &&
        block.type !== "allocation_diff",
    ),
  )
}

export function latestSessionResponse(
  thread: QueryResponse[],
): QueryResponse | null {
  return thread[thread.length - 1] ?? null
}
