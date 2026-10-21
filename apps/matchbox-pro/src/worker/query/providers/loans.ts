import type { Address } from "viem"
import {
  BORROWER_OPERATIONS_ABI,
  COLL_SURPLUS_ABI,
  ERC20_ABI,
  MAINNET,
  PRICE_FEED_ABI,
  SKIP_ORACLE_ABI,
  TROVE_MANAGER_ABI,
} from "./abis"
import type { MezoClient } from "./rpc"

export type TroveStatus =
  | "none"
  | "active"
  | "closed_by_owner"
  | "closed_by_liquidation"
  | "closed_by_redemption"

export type TroveSnapshot = {
  owner: Address
  blockNumber: bigint
  fetchedAt: string
  status: TroveStatus
  // 1e18-scaled USD per BTC from the protocol PriceFeed; null when the oracle
  // is stale (fetchPrice reverts) — never an off-chain substitute.
  price: bigint | null
  oracleUpdatedAt: bigint | null
  coll: bigint
  principal: bigint
  interest: bigint
  interestRateBps: number | null
  mcr: bigint
  ccr: bigint
  gasCompensation: bigint
  minNetDebt: bigint
  tcr: bigint | null
  recoveryMode: boolean | null
  musdBalance: bigint
  surplusCollateral: bigint
}

const STATUS: Record<number, TroveStatus> = {
  0: "none",
  1: "active",
  2: "closed_by_owner",
  3: "closed_by_liquidation",
  4: "closed_by_redemption",
}

/** One snapshot pinned to a single block. */
export async function loadTrove(
  client: MezoClient,
  owner: Address,
): Promise<TroveSnapshot> {
  const blockNumber = await client.getBlockNumber()
  const at = { blockNumber }
  const tm = MAINNET.troveManager
  const [
    statusRaw,
    entire,
    rate,
    mcr,
    ccr,
    gasCompensation,
    minNetDebt,
    musdBalance,
    surplus,
    price,
    round,
  ] = await Promise.all([
    client.readContract({
      ...at,
      address: tm,
      abi: TROVE_MANAGER_ABI,
      functionName: "getTroveStatus",
      args: [owner],
    }),
    client.readContract({
      ...at,
      address: tm,
      abi: TROVE_MANAGER_ABI,
      functionName: "getEntireDebtAndColl",
      args: [owner],
    }),
    client.readContract({
      ...at,
      address: tm,
      abi: TROVE_MANAGER_ABI,
      functionName: "getTroveInterestRate",
      args: [owner],
    }),
    client.readContract({
      ...at,
      address: tm,
      abi: TROVE_MANAGER_ABI,
      functionName: "MCR",
    }),
    client.readContract({
      ...at,
      address: tm,
      abi: TROVE_MANAGER_ABI,
      functionName: "CCR",
    }),
    client.readContract({
      ...at,
      address: tm,
      abi: TROVE_MANAGER_ABI,
      functionName: "MUSD_GAS_COMPENSATION",
    }),
    client.readContract({
      ...at,
      address: MAINNET.borrowerOperations,
      abi: BORROWER_OPERATIONS_ABI,
      functionName: "minNetDebt",
    }),
    client.readContract({
      ...at,
      address: MAINNET.musd,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [owner],
    }),
    client.readContract({
      ...at,
      address: MAINNET.collSurplusPool,
      abi: COLL_SURPLUS_ABI,
      functionName: "getCollateral",
      args: [owner],
    }),
    client
      .readContract({
        ...at,
        address: MAINNET.priceFeed,
        abi: PRICE_FEED_ABI,
        functionName: "fetchPrice",
      })
      .catch(() => null),
    client
      .readContract({
        ...at,
        address: MAINNET.skipOracle,
        abi: SKIP_ORACLE_ABI,
        functionName: "latestRoundData",
      })
      .catch(() => null),
  ])
  const [tcr, recoveryMode] =
    price === null
      ? [null, null]
      : await Promise.all([
          client.readContract({
            ...at,
            address: tm,
            abi: TROVE_MANAGER_ABI,
            functionName: "getTCR",
            args: [price],
          }),
          client.readContract({
            ...at,
            address: tm,
            abi: TROVE_MANAGER_ABI,
            functionName: "checkRecoveryMode",
            args: [price],
          }),
        ])
  const status = STATUS[statusRaw] ?? "none"
  return {
    owner,
    blockNumber,
    fetchedAt: new Date().toISOString(),
    status,
    price,
    oracleUpdatedAt: round ? round[3] : null,
    coll: entire[0],
    principal: entire[1],
    interest: entire[2],
    interestRateBps: status === "active" ? rate : null,
    mcr,
    ccr,
    gasCompensation,
    minNetDebt,
    tcr,
    recoveryMode,
    musdBalance,
    surplusCollateral: surplus,
  }
}
