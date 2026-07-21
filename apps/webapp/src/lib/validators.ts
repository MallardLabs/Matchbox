import { getAddress, isAddress } from "viem"
import { z } from "zod"

const addressSchema = z
  .string()
  .refine(isAddress, "Invalid EVM address")
  .transform((value) => getAddress(value))

export const validatorSchema = z.object({
  operator: addressSchema,
  consensusPublicKey: z.string(),
  moniker: z.string(),
  identity: z.string(),
  website: z.string(),
  securityContact: z.string(),
  details: z.string(),
  gauge: addressSchema,
  bribe: addressSchema,
  beneficiary: addressSchema,
  weight: z.string().regex(/^\d+$/),
  isAlive: z.boolean(),
})

export const validatorsResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(validatorSchema),
  totalWeight: z.string().regex(/^\d+$/),
})

export type Validator = z.infer<typeof validatorSchema>
export type ValidatorsResponse = z.infer<typeof validatorsResponseSchema>
