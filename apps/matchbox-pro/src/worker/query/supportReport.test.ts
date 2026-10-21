import { describe, expect, it } from "vitest"
import { z } from "zod"
import {
  type SupportReportDraft,
  supportReportSubmitSchema,
} from "../../features/query/contract"
import { canonicalJson, sha256Hex } from "./crypto"
import { NOW, WALLET, fakeProviders } from "./fakes"
import { StuartHttpError } from "./http"
import { IdScope } from "./outcome"
import { submitSupportReport } from "./supportReport"
import { draftSupportReportTool } from "./tools/support"

const SECRET = "test-secret"

async function draft(): Promise<SupportReportDraft> {
  const outcome = await draftSupportReportTool.execute(
    {
      providers: fakeProviders(),
      wallet: { address: WALLET, mode: "connected", label: "Main" },
      query: "Claim for #4821 reverts on simulation",
      choice: null,
      now: () => NOW,
      secret: SECRET,
      scope: new IdScope("c1"),
    },
    { problem: "Claim for veMEZO #4821 reverts on simulation.", kind: null },
  )
  if ("invalid" in outcome) throw new Error(outcome.invalid)
  const block = outcome.blocks[0]
  if (block?.type !== "support_report_preview") throw new Error("no preview")
  expect(outcome.answer.text).toBe(
    "Nothing has been sent. Preview is the report.",
  )
  expect(block.sent).toBe(false)
  return block.draft
}

const rpcBodySchema = z.object({
  p_report: z
    .object({
      problemStatement: z.string(),
      included: z.array(
        z.object({ kind: z.string(), label: z.string(), value: z.string() }),
      ),
      wallet: z.object({ address: z.string(), mode: z.string() }).nullable(),
    })
    .loose(),
  p_preview_hash: z.string(),
  p_ip_hash: z.string(),
})

describe("support reports", () => {
  it("stores exactly the previewed payload minus removed items", async () => {
    const preview = await draft()
    expect(preview.kind).toBe("claim")
    let stored: z.infer<typeof rpcBodySchema> | null = null
    const result = await submitSupportReport({
      body: supportReportSubmitSchema.parse({
        version: 1,
        draft: preview,
        problemStatement:
          "Claim for veMEZO #4821 reverts on simulation (edited).",
        includedItemIds: ["message", "versions"],
        wallet: { address: WALLET, mode: "connected" },
        contact: { method: "thread_only" },
      }),
      secret: SECRET,
      ip: "203.0.113.9",
      now: NOW,
      sink: {
        supabaseUrl: "https://example.supabase.co",
        serviceRoleKey: "service-role",
        fetch: async (_url, init) => {
          stored = rpcBodySchema.parse(JSON.parse(String(init?.body)))
          return new Response(JSON.stringify("SR-7F3A19"), { status: 200 })
        },
      },
    })
    expect(result).toMatchObject({ ref: "SR-7F3A19", status: "received" })
    if (!stored) throw new Error("nothing stored")
    const body: z.infer<typeof rpcBodySchema> = stored
    expect(body.p_report.included.map((item) => item.kind)).toEqual([
      "message",
      "indexer_status",
    ])
    expect(body.p_report.wallet).toBeNull()
    expect(body.p_report.problemStatement).toMatch(/\(edited\)\.$/)
    expect(body.p_ip_hash).not.toContain("203.0.113.9")
    expect(body.p_preview_hash).toBe(result.previewHash)
    expect(await sha256Hex(canonicalJson(body.p_report))).toBe(
      result.previewHash,
    )
  })

  it("rejects a tampered draft or items the server never drafted", async () => {
    const preview = await draft()
    const base = {
      version: 1,
      problemStatement: "Claim for veMEZO #4821 reverts on simulation.",
      contact: { method: "thread_only" },
    }
    const sink = {
      supabaseUrl: "https://example.supabase.co",
      serviceRoleKey: "k",
      fetch: async () => new Response('"SR-000000"'),
    }
    for (const body of [
      {
        ...base,
        draft: { ...preview, title: "Something else" },
        includedItemIds: [],
      },
      { ...base, draft: preview, includedItemIds: ["rpc_url"] },
    ]) {
      await expect(
        submitSupportReport({
          body: supportReportSubmitSchema.parse(body),
          secret: SECRET,
          ip: "1",
          now: NOW,
          sink,
        }),
      ).rejects.toBeInstanceOf(StuartHttpError)
    }
  })

  it("is unavailable without Supabase secrets, never silently dropped", async () => {
    const preview = await draft()
    await expect(
      submitSupportReport({
        body: supportReportSubmitSchema.parse({
          version: 1,
          draft: preview,
          problemStatement: "Claim for veMEZO #4821 reverts on simulation.",
          includedItemIds: ["message"],
          contact: { method: "thread_only" },
        }),
        secret: SECRET,
        ip: "1",
        now: NOW,
        sink: { supabaseUrl: null, serviceRoleKey: null },
      }),
    ).rejects.toMatchObject({ status: 503, code: "support_unavailable" })
  })
})
