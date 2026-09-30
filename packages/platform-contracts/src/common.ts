import { z } from "zod"

/** Lower-case 0x-prefixed EVM address, as stored and returned. */
export const addressSchema = z
  .string()
  .regex(/^0x[0-9a-f]{40}$/, "Expected a lower-case 0x address")

/** Accepts any-case EVM address input and normalizes it to lower case. */
export const addressInputSchema = z
  .string()
  .trim()
  .regex(/^0x[0-9a-fA-F]{40}$/, "Expected a 0x address")
  .transform((value) => value.toLowerCase())

/** ISO 8601 timestamp with `Z` or a numeric offset. */
export const isoDateTimeSchema = z.iso.datetime({ offset: true })

export const uuidSchema = z.uuid()

/** Non-negative integer encoded as a base-10 string (token ids, blocks). */
export const decimalStringSchema = z
  .string()
  .regex(/^(0|[1-9][0-9]*)$/, "Expected a non-negative integer string")

export const slugSchema = z
  .string()
  .min(2)
  .max(48)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Lower-case letters, numbers and dashes")

export const emailSchema = z
  .string()
  .trim()
  .max(254)
  .pipe(z.email())
  .transform((value) => value.toLowerCase())

export const httpsUrlSchema = z.url({ protocol: /^https$/ }).max(2048)

export const displayNameSchema = z.string().trim().min(1).max(80)

export const okResponseSchema = z.object({ ok: z.literal(true) })

export type OkResponse = z.infer<typeof okResponseSchema>

/** `{ data, nextCursor }` page envelope around an item schema. */
export function pageSchema<Item extends z.ZodType>(item: Item) {
  return z.object({
    data: z.array(item),
    nextCursor: z.string().nullable(),
  })
}

/** `{ data }` list envelope for unpaginated collections. */
export function listSchema<Item extends z.ZodType>(item: Item) {
  return z.object({ data: z.array(item) })
}
