import { z } from "zod"
import type {
  SupportReportSubmit,
  SupportReportSubmitResponse,
} from "../../features/query/contract"
import { canonicalJson, hmacHex, sha256Hex, timingSafeEqualHex } from "./crypto"
import { StuartHttpError } from "./http"
import { draftTokenMessage } from "./tools/support"

// Stores a report only after the user pressed "Submit report". The stored
// payload is exactly the previewed draft minus the items the user removed,
// with their edited problem statement; the preview hash proves it.

const DRAFT_MAX_AGE_MS = 24 * 60 * 60_000

export type SupportSink = {
  supabaseUrl: string | null
  serviceRoleKey: string | null
  fetch?: typeof globalThis.fetch
}

const refSchema = z.string().regex(/^SR-[A-F0-9]{6}$/)

export async function submitSupportReport(input: {
  body: SupportReportSubmit
  secret: string
  ip: string
  now: Date
  sink: SupportSink
}): Promise<SupportReportSubmitResponse> {
  const { body } = input
  const { draftToken, ...unsigned } = body.draft
  const expected = await hmacHex(input.secret, draftTokenMessage(unsigned))
  if (!timingSafeEqualHex(expected, draftToken)) {
    throw new StuartHttpError(
      400,
      "invalid_request",
      "Report draft is not valid.",
    )
  }
  if (
    input.now.getTime() - Date.parse(body.draft.createdAt) >
    DRAFT_MAX_AGE_MS
  ) {
    throw new StuartHttpError(
      410,
      "proposal_expired",
      "Report draft expired. Draft it again.",
    )
  }
  const keep = new Set(body.includedItemIds)
  const draftIds = new Set(body.draft.included.map((item) => item.itemId))
  if ([...keep].some((id) => !draftIds.has(id))) {
    throw new StuartHttpError(
      400,
      "invalid_request",
      "Report items do not match the preview.",
    )
  }
  const included = body.draft.included.filter(
    (item) => keep.has(item.itemId) || !item.removable,
  )
  const wallet =
    included.some((item) => item.kind === "wallet") && body.wallet
      ? { address: body.wallet.address.toLowerCase(), mode: body.wallet.mode }
      : null
  const report = {
    draftId: body.draft.draftId,
    kind: body.draft.kind,
    title: body.draft.title,
    chainId: body.draft.chainId,
    problemStatement: body.problemStatement,
    included: included.map((item) => ({
      kind: item.kind,
      label: item.label,
      value: item.value,
    })),
    wallet,
    contact:
      body.contact.method === "email"
        ? { email: body.contact.email, consentedAt: input.now.toISOString() }
        : null,
  }
  const previewHash = await sha256Hex(canonicalJson(report))
  if (!input.sink.supabaseUrl || !input.sink.serviceRoleKey) {
    throw new StuartHttpError(
      503,
      "support_unavailable",
      "Support reports are not available right now.",
    )
  }
  const ipHash = await hmacHex(input.secret, `support-ip|${input.ip}`)
  const url = new URL(
    "/rest/v1/rpc/create_support_report",
    input.sink.supabaseUrl,
  )
  const response = await (input.sink.fetch ?? globalThis.fetch)(url, {
    method: "POST",
    headers: {
      apikey: input.sink.serviceRoleKey,
      authorization: `Bearer ${input.sink.serviceRoleKey}`,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      p_report: report,
      p_preview_hash: previewHash,
      p_ip_hash: ipHash,
    }),
    signal: AbortSignal.timeout(8_000),
  })
  if (response.status === 429) {
    // The RPC raises SQLSTATE PT429 on its daily caps (≤ 5 per wallet,
    // ≤ 10 per IP hash); PostgREST maps that to HTTP 429.
    throw new StuartHttpError(
      429,
      "rate_limited",
      "Too many reports today. Try tomorrow.",
      3_600,
    )
  }
  if (response.status === 409) {
    // draft_id is unique: the same preview was already submitted.
    throw new StuartHttpError(
      409,
      "invalid_request",
      "This report was already submitted.",
    )
  }
  if (!response.ok) {
    throw new StuartHttpError(
      502,
      "support_unavailable",
      "Support reports are not available right now.",
    )
  }
  const ref = refSchema.safeParse(await response.json())
  if (!ref.success) {
    throw new StuartHttpError(
      502,
      "support_unavailable",
      "Support reports are not available right now.",
    )
  }
  return { version: 1, ref: ref.data, previewHash, status: "received" }
}
