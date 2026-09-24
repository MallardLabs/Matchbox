import { getExplorerBaseUrl } from "@/config/explorer"
import { formatBps } from "@/lib/mezoGauges/participation"
import type { MezoGaugesHistory } from "@/lib/mezoGauges/schema"
import { Card, Skeleton } from "@mezo-org/mezo-clay"
import { CHAIN_ID } from "@repo/shared/contracts"

import { GaugeSplitBar } from "./GaugeSplitBar"
import { SectionError, formatCompactNumber } from "./shared"

function formatDate(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  })
}

export function EpochHistoryTable({
  entries,
  isLoading,
  error,
}: {
  entries: MezoGaugesHistory["entries"]
  isLoading: boolean
  error: Error | null
}): JSX.Element {
  return (
    <section aria-labelledby="mezo-gauges-history">
      <Card title="Epoch history" withBorder overrides={{}}>
        <h2
          id="mezo-gauges-history"
          className="py-2 text-sm font-medium text-[var(--content-secondary)]"
        >
          Participation at each vote-window close
        </h2>
        {isLoading ? (
          <Skeleton width="100%" height="140px" animation />
        ) : error ? (
          <SectionError message="Unable to load epoch history." />
        ) : (
          <div className="overflow-x-auto pb-4">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <caption className="sr-only">
                Participation at the 7 Sep baseline and each closed vote epoch
              </caption>
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-2xs uppercase tracking-wider text-[var(--content-tertiary)]">
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Epoch
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Participation
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    veMEZO voted
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    NFTs
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Wallets
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Largest voter
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Gauge split
                  </th>
                  <th scope="col" className="py-2 font-medium">
                    Block
                  </th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => {
                  const s = entry.snapshot
                  const label =
                    entry.kind === "baseline"
                      ? "Baseline · 7 Sep"
                      : `E${s.epochIndex} close · ${formatDate(entry.at)}`
                  return (
                    <tr
                      key={`${entry.kind}-${entry.at}`}
                      className="border-b border-[var(--border)] last:border-0"
                    >
                      <th
                        scope="row"
                        className="py-2 pr-4 text-left font-normal text-[var(--content-primary)]"
                      >
                        {label}
                      </th>
                      <td className="py-2 pr-4 font-mono tabular-nums">
                        {formatBps(BigInt(s.participationBps))}
                      </td>
                      <td className="py-2 pr-4 font-mono tabular-nums">
                        {formatCompactNumber(BigInt(s.totalWeight))}
                      </td>
                      <td className="py-2 pr-4 tabular-nums">{s.votingNfts}</td>
                      <td className="py-2 pr-4 tabular-nums">{s.wallets}</td>
                      <td className="py-2 pr-4 font-mono tabular-nums">
                        {s.topWallet
                          ? formatBps(BigInt(s.topWallet.shareBps))
                          : "—"}
                      </td>
                      <td className="py-2 pr-4">
                        <GaugeSplitBar gauges={s.gauges} />
                      </td>
                      <td className="py-2">
                        <a
                          href={`${getExplorerBaseUrl(CHAIN_ID.mainnet)}/block/${s.blockNumber}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-2xs text-[var(--content-tertiary)] no-underline hover:text-[#F7931A] hover:underline"
                        >
                          {s.blockNumber}
                        </a>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </section>
  )
}
