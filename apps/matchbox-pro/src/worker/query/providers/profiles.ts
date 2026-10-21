import { z } from "zod"

// Gauge profile names are user-editable (the Manage profile sheet). They are
// untrusted text: rendered escaped, clipped, and handed to Claude only as
// quoted data fields.

export type GaugeProfileName = {
  gaugeAddress: string
  name: string | null
  veBTCTokenId: string | null
}

const profileRowSchema = z.object({
  gauge_address: z.string(),
  display_name: z.string().nullable().optional(),
  vebtc_token_id: z
    .union([z.string(), z.number()])
    .nullable()
    .optional()
    .transform((value) =>
      value === null || value === undefined ? null : String(value),
    ),
})

export async function fetchGaugeProfileNames(input: {
  supabaseUrl: string | null
  anonKey: string | null
  fetch?: typeof globalThis.fetch
  signal?: AbortSignal
}): Promise<Map<string, GaugeProfileName>> {
  const names = new Map<string, GaugeProfileName>()
  if (!input.supabaseUrl || !input.anonKey) return names
  const url = new URL("/rest/v1/gauge_profiles", input.supabaseUrl)
  url.searchParams.set("select", "gauge_address,display_name,vebtc_token_id")
  const response = await (input.fetch ?? globalThis.fetch)(url, {
    headers: {
      apikey: input.anonKey,
      authorization: `Bearer ${input.anonKey}`,
      accept: "application/json",
    },
    signal: input.signal ?? AbortSignal.timeout(5_000),
  })
  if (!response.ok) return names
  const rows = z.array(profileRowSchema).safeParse(await response.json())
  if (!rows.success) return names
  for (const row of rows.data) {
    const name = row.display_name?.trim()
    names.set(row.gauge_address.toLowerCase(), {
      gaugeAddress: row.gauge_address,
      name: name ? name.slice(0, 80) : null,
      veBTCTokenId: row.vebtc_token_id,
    })
  }
  return names
}
