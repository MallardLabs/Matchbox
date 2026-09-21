import { ClickableAddress } from "@/components/ClickableAddress"
import { MEZO_GAUGES } from "@/lib/mezoGauges/constants"
import { formatBps } from "@/lib/mezoGauges/participation"
import type { MezoGaugesSnapshot } from "@/lib/mezoGauges/schema"
import type { Address } from "viem"

import { formatCompactNumber } from "./shared"

const TOP_N = 25

function gaugeLabel(address: string): string {
  const config = Object.entries(MEZO_GAUGES).find(
    ([a]) => a.toLowerCase() === address,
  )?.[1]
  return config?.name ?? `${address.slice(0, 6)}…${address.slice(-4)}`
}

export function TopVoters({
  snapshot,
}: {
  snapshot: MezoGaugesSnapshot | undefined
}): JSX.Element | null {
  if (!snapshot || snapshot.byWallet.length === 0) return null
  const rows = snapshot.byWallet.slice(0, TOP_N)
  return (
    <details className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <summary className="cursor-pointer text-sm font-medium text-[var(--content-primary)]">
        Top voters ({snapshot.byWallet.length} wallets)
      </summary>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <caption className="sr-only">
            Top voting wallets by veMEZO weight
          </caption>
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-2xs uppercase tracking-wider text-[var(--content-tertiary)]">
              <th scope="col" className="py-2 pr-4 font-medium">
                Wallet
              </th>
              <th scope="col" className="py-2 pr-4 font-medium">
                veMEZO weight
              </th>
              <th scope="col" className="py-2 pr-4 font-medium">
                Share
              </th>
              <th scope="col" className="py-2 font-medium">
                Gauges voted
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((w) => (
              <tr
                key={w.owner}
                className="border-b border-[var(--border)] last:border-0"
              >
                <td className="py-2 pr-4">
                  <ClickableAddress address={w.owner as Address} />
                </td>
                <td className="py-2 pr-4 font-mono tabular-nums">
                  {formatCompactNumber(BigInt(w.weight))}
                </td>
                <td className="py-2 pr-4 font-mono tabular-nums">
                  {formatBps(BigInt(w.shareBps))}
                </td>
                <td className="py-2 text-[var(--content-secondary)]">
                  {w.gauges.map(gaugeLabel).join(", ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mb-0 mt-3 text-2xs text-[var(--content-tertiary)]">
        Owner is the NFT holder at last vote; transferred NFTs may be attributed
        to a prior owner.
      </p>
    </details>
  )
}
