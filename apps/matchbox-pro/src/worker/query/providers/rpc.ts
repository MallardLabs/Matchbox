import { CHAIN_ID } from "@repo/shared/contracts"
import type { Address, ContractFunctionParameters } from "viem"
import { z } from "zod"
import { chunkArray } from "../../../lib/chunk"
import createMezoClient from "../../mezoClient"

export type MezoClient = ReturnType<typeof createMezoClient>

const CHUNK = 200

let mainnetClient: MezoClient | null = null

export function mezoMainnet(): MezoClient {
  mainnetClient ??= createMezoClient(CHAIN_ID.mainnet)
  return mainnetClient
}

export const bigintSchema = z.bigint()
export const addressSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/)
  .transform((value): Address => `0x${value.slice(2)}`)
export const stringSchema = z.string()
export const boolSchema = z.boolean()
export const numberSchema = z.number()

/** Multicall with per-call failure tolerance; every result is zod-validated. */
export async function multicallParsed<T>(
  client: MezoClient,
  contracts: readonly ContractFunctionParameters[],
  schema: z.ZodType<T>,
  blockNumber?: bigint,
): Promise<Array<T | null>> {
  if (contracts.length === 0) return []
  const chunks = await Promise.all(
    chunkArray([...contracts], CHUNK).map((chunk) =>
      client.multicall({
        contracts: chunk,
        allowFailure: true,
        ...(blockNumber !== undefined ? { blockNumber } : {}),
      }),
    ),
  )
  return chunks.flat().map((entry) => {
    if (entry.status !== "success") return null
    const parsed = schema.safeParse(entry.result)
    return parsed.success ? parsed.data : null
  })
}
