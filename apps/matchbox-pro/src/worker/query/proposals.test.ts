import { describe, expect, it } from "vitest"
import type { Proposal } from "../../features/query/contract"
import { proposalSchema } from "../../features/query/contract"
import { WALLET } from "./fakes"
import { materialReasons, voteDiffBlock } from "./materiality"
import { type ProposalDraft, sealProposal, verifyProposal } from "./proposals"

const SECRET = "test-secret"
const VOTER = "0x2Ba614a598Cffa5a19d683cDCA97bac3a49313d1"
const A = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1"
const B = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa2"
const C = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa3"

function voteDraft(input: {
  bps: Array<[string, number, string]>
  projected: string
  canSign?: boolean
  data?: string
}): ProposalDraft {
  return {
    kind: "vote",
    chainId: 31_612,
    from: WALLET,
    origin: "optimizer",
    status: input.canSign === false ? "read_only" : "unsigned",
    canSign: input.canSign ?? true,
    blockedReason: input.canSign === false ? "connect_this_wallet" : null,
    createdAt: "2026-10-21T12:00:00.000Z",
    expiresAt: "2026-10-21T12:15:00.000Z",
    snapshotBlock: "12482113",
    calculationVersion: "1.0.0",
    atomicity: "single",
    approvals: [],
    calls: [
      {
        index: 0,
        chainId: 31_612,
        from: WALLET,
        to: VOTER,
        data: input.data ?? "0xabcdef",
        value: "0x0",
        kind: "vote",
        label: "1 · Vote with veMEZO #4821",
        dependsOn: null,
        refreshAfterDependency: false,
      },
    ],
    simulation: { status: "passed", method: "eth_call", calls: [] },
    quote: null,
    content: {
      kind: "vote",
      manualOverride: false,
      projectedUsd: input.projected,
      projectedNative: null,
      ballots: [
        {
          ballotKey: "boost:4821",
          branch: "boost",
          governanceAsset: "veMEZO",
          votingContract: VOTER,
          tokenId: "4821",
          votingPower: "1000",
          selected: true,
          allocations: input.bps.map(([address, bps, projected]) => ({
            targetId: address,
            targetAddress: address,
            name: address.slice(-1),
            bps,
            projectedUsd: projected,
          })),
        },
      ],
    },
  }
}

async function vote(input: Parameters<typeof voteDraft>[0]): Promise<Proposal> {
  return sealProposal(voteDraft(input), SECRET)
}

describe("proposal handles", () => {
  it("round-trips the contract schema and verifies", async () => {
    const proposal = await vote({
      bps: [[A, 10_000, "86.400000"]],
      projected: "86.400000",
    })
    expect(proposalSchema.parse(proposal)).toEqual(proposal)
    expect(await verifyProposal(proposal, SECRET)).toBe(true)
    expect(proposal.proposalId).toBe(
      `vote_${proposal.proposalHash.slice(2, 10)}`,
    )
  })

  it("rejects any tampered field or a foreign secret", async () => {
    const proposal = await vote({
      bps: [[A, 10_000, "86.400000"]],
      projected: "86.400000",
    })
    const tampered: Proposal[] = [
      { ...proposal, origin: "manual" },
      { ...proposal, expiresAt: "2026-10-22T12:15:00.000Z" },
      { ...proposal, from: "0x0000000000000000000000000000000000000001" },
      { ...proposal, canSign: !proposal.canSign },
      {
        ...proposal,
        calls: proposal.calls.map((call) => ({
          ...call,
          to: "0x0000000000000000000000000000000000000002",
        })),
      },
    ]
    for (const candidate of tampered) {
      expect(await verifyProposal(candidate, SECRET)).toBe(false)
    }
    expect(await verifyProposal(proposal, "another-secret")).toBe(false)
  })
})

describe("material change rule", () => {
  it("ignores a 1 bp jitter and the calldata change it causes", async () => {
    const before = await vote({
      bps: [
        [A, 6_000, "50.000000"],
        [B, 4_000, "36.400000"],
      ],
      projected: "86.400000",
    })
    const after = await vote({
      bps: [
        [A, 5_999, "50.000000"],
        [B, 4_001, "36.400000"],
      ],
      projected: "86.410000",
      data: "0x123456",
    })
    expect(materialReasons(before, after)).toEqual([])
  })

  it("flags a ≥ 1 percentage point move", async () => {
    const before = await vote({
      bps: [
        [A, 4_200, "36.200000"],
        [B, 5_800, "50.200000"],
      ],
      projected: "86.400000",
    })
    const after = await vote({
      bps: [
        [A, 3_800, "34.100000"],
        [B, 6_200, "52.300000"],
      ],
      projected: "86.400000",
    })
    expect(materialReasons(before, after)).toContain("allocation_pp")
  })

  it("flags a ≥ 1% projected USD move", async () => {
    const before = await vote({
      bps: [[A, 10_000, "86.400000"]],
      projected: "86.400000",
    })
    const after = await vote({
      bps: [[A, 10_000, "84.100000"]],
      projected: "84.100000",
    })
    expect(materialReasons(before, after)).toEqual(["projected_pct"])
    const small = await vote({
      bps: [[A, 10_000, "86.000000"]],
      projected: "86.000000",
    })
    expect(materialReasons(before, small)).toEqual([])
  })

  it("flags a target set change and a signability flip", async () => {
    const before = await vote({
      bps: [
        [A, 5_000, "40.000000"],
        [B, 5_000, "46.400000"],
      ],
      projected: "86.400000",
    })
    const after = await vote({
      bps: [
        [A, 5_000, "40.000000"],
        [C, 5_000, "46.400000"],
      ],
      projected: "86.400000",
    })
    expect(materialReasons(before, after)).toEqual(
      expect.arrayContaining(["target_set", "allocation_pp"]),
    )
    const unsignable = await vote({
      bps: [
        [A, 5_000, "40.000000"],
        [B, 5_000, "46.400000"],
      ],
      projected: "86.400000",
      canSign: false,
    })
    expect(materialReasons(before, unsignable)).toContain("can_sign")
  })

  it("flags a lower min-out and a larger approval on zaps", async () => {
    const base = voteDraft({
      bps: [[A, 10_000, "1.000000"]],
      projected: "1.000000",
    })
    const zap = (minOut: string, approval: string): ProposalDraft => ({
      ...base,
      kind: "zap",
      atomicity: "sequential_non_atomic",
      approvals: [
        {
          token: "0x7B7c000000000000000000000000000000000001",
          spender: "0x37cDd11919ec3860eaD9efB8673d7476E5326225",
          amount: { raw: approval, decimals: 18, symbol: "MEZO" },
          mode: "exact",
        },
      ],
      quote: {
        routerId: "tigris-cl-mezo-musd-200",
        router: "0x37cDd11919ec3860eaD9efB8673d7476E5326225",
        pool: "0x1D6e8D24c133535F2d00676F66a0e824f84765ff",
        amountIn: { raw: approval, decimals: 18, symbol: "MEZO" },
        amountInUsd: "50.000000",
        quotedOut: { raw: minOut, decimals: 18, symbol: "mUSD" },
        minOut: { raw: minOut, decimals: 18, symbol: "mUSD" },
        feeBps: 30,
        priceImpactBps: 5,
        maxPriceImpactBps: 100,
        slippageBps: 50,
        quotedAt: "2026-10-21T12:00:00.000Z",
        expiresAt: "2026-10-21T12:01:00.000Z",
        deadline: 1_792_584_120,
      },
      content: {
        kind: "zap",
        fundingAsset: "MEZO",
        destinationId: "musd-savings",
        depositAmount: { raw: minOut, decimals: 18, symbol: "mUSD" },
        expectedShares: { raw: minOut, decimals: 18, symbol: "sMUSD" },
      },
    })
    const before = await sealProposal(zap("49000", "17400"), SECRET)
    const same = await sealProposal(zap("49100", "17400"), SECRET)
    const worse = await sealProposal(zap("48900", "17500"), SECRET)
    expect(materialReasons(before, same)).toEqual([])
    expect(materialReasons(before, worse)).toEqual(
      expect.arrayContaining(["quote", "approval"]),
    )
  })

  it("renders the frame 38 diff with Was / Now / Δ projected", async () => {
    const before = await vote({
      bps: [
        [A, 4_200, "36.200000"],
        [B, 5_800, "50.200000"],
      ],
      projected: "86.400000",
    })
    const after = await vote({
      bps: [
        [A, 3_800, "34.100000"],
        [B, 6_200, "50.000000"],
      ],
      projected: "84.100000",
    })
    const reasons = materialReasons(before, after)
    const diff = voteDiffBlock({
      id: "p.b.diff",
      before,
      after,
      material: reasons.length > 0,
      reasons,
      manualEditsPreserved: false,
      evidenceRefs: [],
    })
    expect(diff.material).toBe(true)
    expect(diff.projectedDeltaBps).toBe(-266)
    expect(diff.rows.find((row) => row.targetId === A)).toMatchObject({
      beforeBps: 4_200,
      afterBps: 3_800,
      deltaProjectedUsd: "-2.100000",
    })
    expect(diff.actions).toEqual(["acknowledge_new_optimum"])
  })
})
