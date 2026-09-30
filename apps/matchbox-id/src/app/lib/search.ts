import { chainIdSchema } from "@repo/platform-contracts/network"
import { z } from "zod"

/** `/sign-in?return=/authorize?request=…&force=true&chain=31612` */
export const signInSearchSchema = z.object({
  return: z.string().max(2048).optional().catch(undefined),
  /** Re-sign even with a session (`prompt=login`, switching wallets). */
  force: z.boolean().optional().catch(undefined),
  /**
   * Chain the SIWE message must name: a contract-account session verified
   * on another network has to sign in again on the client's network.
   */
  chain: chainIdSchema.optional().catch(undefined),
})

/** `/authorize?request=<uuid>` */
export const authorizeSearchSchema = z.object({
  request: z.string().max(64).catch(""),
})
