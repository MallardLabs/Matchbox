import type { z } from "zod"
import {
  type ProposalRefreshRequest,
  type ProposalRefreshResponse,
  type StuartRequest,
  type StuartResponse,
  type StuartStatus,
  type SupportReportSubmit,
  type SupportReportSubmitResponse,
  proposalRefreshResponseSchema,
  stuartErrorSchema,
  stuartResponseSchema,
  stuartStatusSchema,
  supportReportSubmitResponseSchema,
} from "./contract"

export type StuartErrorCode =
  | "invalid_request"
  | "rate_limited"
  | "forbidden"
  | "too_large"
  | "unavailable"
  | "network"
  | "bad_response"
  | "proposal_expired"
  | "wallet_mismatch"
  | "support_unavailable"

/** A failed call to the Stuart runtime, with copy safe to show as-is. */
export class StuartClientError extends Error {
  readonly code: StuartErrorCode
  readonly status: number | null
  readonly retryAfterSeconds: number | null

  constructor(
    code: StuartErrorCode,
    status: number | null,
    retryAfterSeconds: number | null = null,
  ) {
    super(errorCopy(code, retryAfterSeconds))
    this.name = "StuartClientError"
    this.code = code
    this.status = status
    this.retryAfterSeconds = retryAfterSeconds
  }
}

export function errorCopy(
  code: StuartErrorCode,
  retryAfterSeconds: number | null,
): string {
  switch (code) {
    case "rate_limited":
      return retryAfterSeconds
        ? `Too many questions. Try again in ${retryAfterSeconds}s.`
        : "Too many questions. Try again shortly."
    case "invalid_request":
      return "Stuart couldn't read that request."
    case "too_large":
      return "That question is too long."
    case "forbidden":
      return "This page can't reach Stuart."
    case "network":
      return "Stuart is unreachable. Check the connection and retry."
    case "bad_response":
      return "Stuart sent an answer this page can't read."
    case "proposal_expired":
      return "This proposal expired. Ask again for a fresh one."
    case "wallet_mismatch":
      return "Prepared for another wallet. Ask again from this one."
    case "support_unavailable":
      return "Support reports are unavailable right now."
    case "unavailable":
      return "Stuart is unavailable. Retry in a moment."
  }
}

const ENVELOPE_CODES: Record<
  z.infer<typeof stuartErrorSchema>["error"]["code"],
  StuartErrorCode
> = {
  invalid_request: "invalid_request",
  forbidden_origin: "forbidden",
  unsupported_media_type: "invalid_request",
  payload_too_large: "too_large",
  rate_limited: "rate_limited",
  invalid_proposal: "invalid_request",
  proposal_expired: "proposal_expired",
  wallet_mismatch: "wallet_mismatch",
  support_unavailable: "support_unavailable",
  internal: "unavailable",
}

function codeForStatus(status: number): StuartErrorCode {
  if (status === 429) return "rate_limited"
  if (status === 413) return "too_large"
  if (status === 403) return "forbidden"
  if (status === 400 || status === 415) return "invalid_request"
  return "unavailable"
}

function retryAfterHeader(response: Response): number | null {
  const header = response.headers.get("retry-after")
  if (!header || !/^\d+$/.test(header.trim())) return null
  return Number.parseInt(header.trim(), 10)
}

async function errorFor(response: Response): Promise<StuartClientError> {
  let code = codeForStatus(response.status)
  let retryAfter = retryAfterHeader(response)
  try {
    const envelope = stuartErrorSchema.safeParse(await response.json())
    if (envelope.success) {
      code = ENVELOPE_CODES[envelope.data.error.code]
      retryAfter = envelope.data.error.retryAfterSeconds ?? retryAfter
    }
  } catch {
    // Not JSON: the status code is all there is.
  }
  return new StuartClientError(code, response.status, retryAfter)
}

async function postJson<T>(
  path: string,
  body: unknown,
  schema: z.ZodType<T>,
  signal?: AbortSignal,
): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      credentials: "same-origin",
      cache: "no-store",
      ...(signal ? { signal } : {}),
    })
  } catch (error) {
    if (signal?.aborted) throw error
    throw new StuartClientError("network", null)
  }
  if (!response.ok) throw await errorFor(response)
  let json: unknown
  try {
    json = await response.json()
  } catch {
    throw new StuartClientError("bad_response", response.status)
  }
  const parsed = schema.safeParse(json)
  if (!parsed.success) {
    throw new StuartClientError("bad_response", response.status)
  }
  return parsed.data
}

export function askStuart(
  request: StuartRequest,
  signal?: AbortSignal,
): Promise<StuartResponse> {
  return postJson("/api/query", request, stuartResponseSchema, signal)
}

export function refreshProposal(
  request: ProposalRefreshRequest,
  signal?: AbortSignal,
): Promise<ProposalRefreshResponse> {
  return postJson(
    "/api/proposal/refresh",
    request,
    proposalRefreshResponseSchema,
    signal,
  )
}

export function submitSupportReport(
  request: SupportReportSubmit,
  signal?: AbortSignal,
): Promise<SupportReportSubmitResponse> {
  return postJson(
    "/api/support-report",
    request,
    supportReportSubmitResponseSchema,
    signal,
  )
}

/** GET /api/query/status; null when the runtime doesn't say. */
export async function fetchStuartStatus(
  signal?: AbortSignal,
): Promise<StuartStatus | null> {
  try {
    const response = await fetch("/api/query/status", {
      credentials: "same-origin",
      ...(signal ? { signal } : {}),
    })
    if (!response.ok) return null
    const parsed = stuartStatusSchema.safeParse(await response.json())
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError"
}

export function describeStuartError(error: unknown): string {
  if (error instanceof StuartClientError) return error.message
  return errorCopy("unavailable", null)
}
