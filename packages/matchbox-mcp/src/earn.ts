import { CHAIN_ID } from "@repo/shared/contracts"
import {
  type Address,
  encodeFunctionData,
  erc20Abi,
  formatUnits,
  getAddress,
  parseUnits,
} from "viem"
import { z } from "zod"
import {
  type GaugeAdapterOptions,
  createMezoClient,
} from "./adapters/matchbox-gauges"
import { transactionRequestSchema } from "./transactions"

export const MUSD_SAVINGS_RATE_ADDRESS = getAddress(
  "0xb4D498029af77680cD1eF828b967f010d06C51CC",
)

const savingsAbi = [
  {
    inputs: [],
    name: "musdToken",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "assets", type: "uint256" }],
    name: "deposit",
    outputs: [{ internalType: "uint256", name: "shares", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const

const decimalAmountSchema = z.string().regex(/^\d+(?:\.\d+)?$/)

export const preparedEarnDepositSchema = z.object({
  status: z.enum([
    "unsigned",
    "needs-approval",
    "blocked",
    "read-only",
    "unavailable",
  ]),
  canSign: z.boolean(),
  amount: decimalAmountSchema,
  fundingAsset: z.string(),
  vault: z.string(),
  vaultAddress: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/)
    .nullable(),
  route: z.array(z.object({ label: z.string(), value: z.string() })),
  balance: decimalAmountSchema.nullable(),
  allowance: decimalAmountSchema.nullable(),
  transactionRequests: z.array(transactionRequestSchema),
  simulation: z.object({
    status: z.enum(["passed", "blocked", "not-run"]),
    calls: z.number().int().nonnegative(),
    gasEstimate: z.string().nullable(),
    reason: z.string().nullable(),
  }),
  notice: z.string(),
})

export type PreparedEarnDeposit = z.infer<typeof preparedEarnDepositSchema>

function unavailable(input: {
  amount: string
  fundingAsset: string
  walletMode: "connected" | "watching" | "inspecting"
}): PreparedEarnDeposit {
  return preparedEarnDepositSchema.parse({
    status: "unavailable",
    canSign: false,
    amount: input.amount,
    fundingAsset: input.fundingAsset,
    vault: "MEZO / MUSD Earn Vault",
    vaultAddress: null,
    route: [
      { label: "Requested", value: `${input.amount} ${input.fundingAsset}` },
      { label: "Route", value: "Swap + liquidity + vault deposit" },
    ],
    balance: null,
    allowance: null,
    transactionRequests: [],
    simulation: {
      status: "not-run",
      calls: 0,
      gasEstimate: null,
      reason: "No approved Matchbox zap router is configured.",
    },
    notice:
      "Stuart found no approved MEZO/MUSD zap router in the Matchbox contract registry, so it did not invent a transaction.",
  })
}

function cleanError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.replace(/\s+/g, " ").slice(0, 280)
}

export async function prepareEarnDeposit(input: {
  address: string
  walletMode: "connected" | "watching" | "inspecting"
  amount: string
  fundingAsset: string
  vault: string
  options?: GaugeAdapterOptions
}): Promise<PreparedEarnDeposit> {
  const amount = decimalAmountSchema.parse(input.amount)
  const isSavings =
    /savings|smusd/i.test(input.vault) &&
    input.fundingAsset.trim().toUpperCase() === "MUSD"
  if (!isSavings) {
    return unavailable({
      amount,
      fundingAsset: input.fundingAsset,
      walletMode: input.walletMode,
    })
  }

  const account = getAddress(input.address)
  const client = createMezoClient(input.options)
  const musdAddress = await client.readContract({
    address: MUSD_SAVINGS_RATE_ADDRESS,
    abi: savingsAbi,
    functionName: "musdToken",
  })
  const [decimals, balance, allowance] = await Promise.all([
    client.readContract({
      address: musdAddress,
      abi: erc20Abi,
      functionName: "decimals",
    }),
    client.readContract({
      address: musdAddress,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [account],
    }),
    client.readContract({
      address: musdAddress,
      abi: erc20Abi,
      functionName: "allowance",
      args: [account, MUSD_SAVINGS_RATE_ADDRESS],
    }),
  ])
  const rawAmount = parseUnits(amount, decimals)
  const formattedBalance = formatUnits(balance, decimals)
  const formattedAllowance = formatUnits(allowance, decimals)
  const common = {
    amount,
    fundingAsset: "MUSD",
    vault: "MUSD Savings Vault",
    vaultAddress: MUSD_SAVINGS_RATE_ADDRESS,
    route: [
      { label: "Use from wallet", value: `${amount} MUSD` },
      { label: "Deposit", value: "MUSD → MUSD Savings Vault" },
    ],
    balance: formattedBalance,
    allowance: formattedAllowance,
  }

  if (balance < rawAmount) {
    return preparedEarnDepositSchema.parse({
      ...common,
      status: "blocked",
      canSign: false,
      transactionRequests: [],
      simulation: {
        status: "blocked",
        calls: 0,
        gasEstimate: null,
        reason: `Insufficient MUSD balance: ${formattedBalance} available.`,
      },
      notice:
        "The connected wallet does not have enough MUSD for this deposit.",
    })
  }
  if (input.walletMode !== "connected") {
    return preparedEarnDepositSchema.parse({
      ...common,
      status: "read-only",
      canSign: false,
      transactionRequests: [],
      simulation: {
        status: "not-run",
        calls: 0,
        gasEstimate: null,
        reason: "Watched and inspected wallets are read-only.",
      },
      notice: "Connect this wallet to prepare an unsigned deposit request.",
    })
  }

  const approvalRequest = transactionRequestSchema.parse({
    chainId: CHAIN_ID.mainnet,
    from: account,
    to: musdAddress,
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: "approve",
      args: [MUSD_SAVINGS_RATE_ADDRESS, rawAmount],
    }),
    value: "0x0",
    label: `Approve exactly ${amount} MUSD`,
  })
  const depositRequest = transactionRequestSchema.parse({
    chainId: CHAIN_ID.mainnet,
    from: account,
    to: MUSD_SAVINGS_RATE_ADDRESS,
    data: encodeFunctionData({
      abi: savingsAbi,
      functionName: "deposit",
      args: [rawAmount],
    }),
    value: "0x0",
    label: `Deposit ${amount} MUSD into Savings`,
  })
  if (allowance < rawAmount) {
    try {
      await client.call({
        account,
        to: getAddress(approvalRequest.to),
        data: approvalRequest.data as `0x${string}`,
      })
      return preparedEarnDepositSchema.parse({
        ...common,
        status: "needs-approval",
        canSign: true,
        transactionRequests: [approvalRequest, depositRequest],
        simulation: {
          status: "not-run",
          calls: 2,
          gasEstimate: null,
          reason:
            "Approval simulation passed; deposit simulation requires the approval state first.",
        },
        notice:
          "Two user confirmations are required: an exact MUSD approval, then the deposit.",
      })
    } catch (error) {
      return preparedEarnDepositSchema.parse({
        ...common,
        status: "blocked",
        canSign: false,
        transactionRequests: [],
        simulation: {
          status: "blocked",
          calls: 1,
          gasEstimate: null,
          reason: cleanError(error),
        },
        notice: "The exact approval did not pass simulation.",
      })
    }
  }

  try {
    const call = {
      account,
      to: MUSD_SAVINGS_RATE_ADDRESS as Address,
      data: depositRequest.data as `0x${string}`,
    }
    await client.call(call)
    const gasEstimate = await client.estimateGas(call)
    return preparedEarnDepositSchema.parse({
      ...common,
      status: "unsigned",
      canSign: true,
      transactionRequests: [depositRequest],
      simulation: {
        status: "passed",
        calls: 1,
        gasEstimate: gasEstimate.toString(),
        reason: null,
      },
      notice:
        "The direct MUSD Savings deposit passed simulation and remains unsigned.",
    })
  } catch (error) {
    return preparedEarnDepositSchema.parse({
      ...common,
      status: "blocked",
      canSign: false,
      transactionRequests: [],
      simulation: {
        status: "blocked",
        calls: 1,
        gasEstimate: null,
        reason: cleanError(error),
      },
      notice: "The direct MUSD Savings deposit did not pass simulation.",
    })
  }
}
