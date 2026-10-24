import {
  connectedAppGrantSchema,
  endedGrantSchema,
  grantListResponseSchema,
  identityAccountSchema,
  signerKindSchema,
} from "@repo/platform-contracts/identity"
import { networkSlugSchema } from "@repo/platform-contracts/network"
import { oidcScopeSchema } from "@repo/platform-contracts/scopes"
import { z } from "zod"

/**
 * Stricter views of `@repo/platform-contracts/identity` responses: fields
 * the shared schemas add as optional (for older servers) are always sent by
 * this Worker, so the SPA can rely on them.
 */

export const identityAccountViewSchema = identityAccountSchema.extend({
  signerKind: signerKindSchema.nullable(),
})

export type IdentityAccountView = z.infer<typeof identityAccountViewSchema>

export const sessionViewResponseSchema = z.object({
  account: identityAccountViewSchema.nullable(),
})

export type SessionViewResponse = z.infer<typeof sessionViewResponseSchema>

export const siweVerifyViewResponseSchema = z.object({
  account: identityAccountViewSchema,
})

export type SiweVerifyViewResponse = z.infer<
  typeof siweVerifyViewResponseSchema
>

export const connectedAppViewSchema = connectedAppGrantSchema.extend({
  network: networkSlugSchema,
  verified: z.boolean(),
  declinedScopes: z.array(oidcScopeSchema),
})

export type ConnectedAppView = z.infer<typeof connectedAppViewSchema>

/** Ended grants listed with the connected apps. */
export const endedGrantLimit = 20

export const grantListViewResponseSchema = grantListResponseSchema.extend({
  data: z.array(connectedAppViewSchema),
  ended: z.array(endedGrantSchema).max(endedGrantLimit),
})

export type GrantListViewResponse = z.infer<typeof grantListViewResponseSchema>
