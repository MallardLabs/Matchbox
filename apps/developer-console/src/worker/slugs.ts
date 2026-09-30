import { slugSchema } from "@repo/platform-contracts/common"
import { randomBase62 } from "@repo/platform-server"

/** Lower-case, dash-separated slug (2–48 chars) derived from a name. */
export function slugify(value: string, fallback: string): string {
  const slug = value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "")
  return slugSchema.safeParse(slug).success ? slug : fallback
}

/** First free slug among `base`, then `base-xxxx` random suffixes. */
export async function uniqueSlug(
  base: string,
  taken: (slug: string) => Promise<boolean>,
): Promise<string> {
  if (!(await taken(base))) return base
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = `${base}-${randomBase62(6).toLowerCase()}`
    if (!(await taken(candidate))) return candidate
  }
  throw new Error("Could not allocate a unique slug")
}
