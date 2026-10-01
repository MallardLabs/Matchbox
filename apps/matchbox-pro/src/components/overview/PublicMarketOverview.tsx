import EarningsChart from "@/components/overview/EarningsChart"
import Button from "@/components/ui/Button"
import { useBoostGauges } from "@/hooks/useBoostGauges"
import { useBtcPrice, useMezoPrice } from "@/hooks/usePrices"
import { useGaugeProfiles } from "@/hooks/useProfiles"
import { useTopology } from "@/hooks/useTopology"
import { cn } from "@/lib/cn"
import { useNetwork } from "@/lib/network"
import {
  formatCompactNumber,
  formatCompactUsd,
  formatWholeUsd,
  gaugeDisplayName,
} from "@/lib/overview"
import { referencePriceUsd, tokenUsdMicro } from "@/lib/tokenUsd"
import { Link } from "@tanstack/react-router"
import { Search } from "lucide-react"
import { type ReactElement, useMemo, useState } from "react"
import { isAddress } from "viem"
import { usePublicClient } from "wagmi"

type MarketRow = {
  address: `0x${string}`
  name: string
  totalMicro: bigint
  fundedTokens: number
  tokenCount: number
  hasUnpriced: boolean
}

/** Pen 25: the public "This epoch's incentive market" page for visitors. */
export default function PublicMarketOverview({
  epochRemaining,
  onConnect,
}: {
  epochRemaining: string
  onConnect: () => void
}): ReactElement {
  const topology = useTopology()
  const { gauges, isLoading: loadingGauges, veMezoTotal } = useBoostGauges()
  const { data: profiles } = useGaugeProfiles()
  const { data: btcPrice = null, isLoading: loadingBtc } = useBtcPrice()
  const { data: mezoPrice = null, isLoading: loadingMezo } = useMezoPrice()

  const rows = useMemo<MarketRow[]>(() => {
    return (topology.data?.gauges ?? [])
      .map((gauge) => {
        let totalMicro = 0n
        let fundedTokens = 0
        let hasUnpriced = false
        for (const token of gauge.rewardTokens) {
          const amount = BigInt(token.epochAmount)
          if (amount <= 0n) continue
          fundedTokens += 1
          const prices = {
            tokenAddress: token.tokenAddress,
            symbol: token.symbol,
            btcPriceUsd: btcPrice,
            mezoPriceUsd: mezoPrice,
          }
          if (!referencePriceUsd(prices)) hasUnpriced = true
          totalMicro += tokenUsdMicro({
            ...prices,
            amount,
            decimals: token.decimals,
          })
        }
        return {
          address: gauge.gaugeAddress,
          name: gaugeDisplayName(profiles, gauge.gaugeAddress),
          totalMicro,
          fundedTokens,
          tokenCount: gauge.rewardTokens.length,
          hasUnpriced,
        }
      })
      .filter((row) => row.fundedTokens > 0)
      .sort((a, b) =>
        a.totalMicro === b.totalMicro
          ? 0
          : a.totalMicro > b.totalMicro
            ? -1
            : 1,
      )
  }, [btcPrice, mezoPrice, profiles, topology.data?.gauges])

  const totalMicro = rows.reduce((sum, row) => sum + row.totalMicro, 0n)
  const unpricedCount = rows.filter((row) => row.hasUnpriced).length
  const activeGaugeCount = gauges.filter((gauge) => gauge.isAlive).length
  const votedVeMezo = gauges.reduce((sum, gauge) => sum + gauge.totalWeight, 0n)
  const loading =
    topology.isLoading || loadingGauges || loadingBtc || loadingMezo
  const wholeVe = (amount: bigint) => formatCompactNumber(amount / 10n ** 18n)

  return (
    <section className="flex flex-col gap-7" aria-labelledby="market-title">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2">
          <p className="text-[13px] font-600 text-accent-ink">
            Epoch · {epochRemaining}
          </p>
          <h1
            id="market-title"
            className="text-balance text-[24px] font-600 leading-tight text-ink md:text-[28px]"
          >
            Incentive market
          </h1>
        </div>
        <Button
          size="lg"
          className="rounded-md font-600 max-sm:h-12 max-sm:w-full max-sm:rounded-[10px] max-sm:text-[14px]"
          onClick={onConnect}
        >
          Connect wallet
        </Button>
      </header>

      {topology.isError ? (
        <div
          role="alert"
          className="flex flex-col items-start gap-2 rounded-lg border border-neg/30 bg-neg/5 p-5"
        >
          <p className="text-[16px] font-600 text-ink">
            Market data unavailable
          </p>
          <Button
            variant="secondary"
            size="lg"
            className="h-9"
            onClick={() => void topology.refetch()}
          >
            Try again
          </Button>
        </div>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-y-4 border-y border-line py-4 lg:grid-cols-4">
            <Metric
              label="Deposited"
              value={loading ? "—" : formatCompactUsd(totalMicro)}
              detail={
                unpricedCount > 0 ? `USD · ${unpricedCount} unpriced` : "USD"
              }
            />
            <Metric
              label="Boost gauges"
              value={loading ? "—" : String(activeGaugeCount)}
              detail="Active"
            />
            <Metric
              label="Funded gauges"
              value={loading ? "—" : String(rows.length)}
              detail="With incentives"
            />
            <Metric
              label="veMEZO voted"
              value={loading ? "—" : wholeVe(votedVeMezo)}
              detail={loading ? "—" : `of ${wholeVe(veMezoTotal)}`}
            />
          </dl>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
            <section aria-labelledby="top-incentives" className="min-w-0">
              <div className="flex items-end justify-between gap-4 pb-3">
                <h2
                  id="top-incentives"
                  className="text-balance text-[14px] font-600 text-ink"
                >
                  Top incentives
                </h2>
              </div>
              <MarketTable rows={rows.slice(0, 6)} loading={loading} />
            </section>

            <EarningsChart
              title="Incentives deposited"
              bars={rows.slice(0, 7).map((row, index) => ({
                key: row.address,
                label: row.name,
                microUsd: row.totalMicro,
                tone: index === 0 ? "current" : "past",
              }))}
              empty={loading ? "Loading…" : "No deposits"}
            />
          </div>
        </>
      )}

      <InspectAddress />
    </section>
  )
}

function Metric({
  label,
  value,
  detail,
}: {
  label: string
  value: string
  detail: string
}): ReactElement {
  return (
    <div className="flex flex-col gap-1 border-line px-5 even:border-l lg:[&:not(:first-child)]:border-l">
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd className="text-[20px] font-600 tabular-nums text-ink">{value}</dd>
      <dd className="text-pretty text-[11px] text-secondary">{detail}</dd>
    </div>
  )
}

function MarketTable({
  rows,
  loading,
}: {
  rows: MarketRow[]
  loading: boolean
}): ReactElement {
  const head = "pb-2 text-[11px] font-400 text-muted"
  return (
    <table
      aria-busy={loading}
      className="w-full table-fixed border-collapse text-left"
    >
      <thead>
        <tr>
          <th scope="col" className={head}>
            Gauge
          </th>
          <th scope="col" className={cn(head, "w-[100px] pl-3 max-sm:hidden")}>
            Type
          </th>
          <th
            scope="col"
            className={cn(head, "w-[88px] pl-3 text-right sm:w-[100px]")}
          >
            Deposited
          </th>
          <th
            scope="col"
            className={cn(head, "w-[64px] pl-3 text-right sm:w-[76px]")}
          >
            Funded
          </th>
        </tr>
      </thead>
      <tbody className="border-t border-line">
        {loading ? (
          [0, 1, 2, 3, 4].map((item) => (
            <tr key={item} className="border-b border-line">
              <td className="py-3">
                <span className="block h-3 w-40 max-w-full rounded bg-inset" />
              </td>
              <td className="py-3 pl-3 max-sm:hidden">
                <span className="block h-3 w-12 rounded bg-inset" />
              </td>
              <td className="py-3 pl-3">
                <span className="ml-auto block h-3 w-16 rounded bg-inset" />
              </td>
              <td className="py-3 pl-3">
                <span className="ml-auto block h-3 w-8 rounded bg-inset" />
              </td>
            </tr>
          ))
        ) : rows.length === 0 ? (
          <tr className="border-b border-line">
            <td colSpan={4} className="py-6">
              <p className="text-[14px] font-600 text-ink">No funded gauges</p>
            </td>
          </tr>
        ) : (
          rows.map((row, index) => (
            <tr
              key={row.address}
              className="group relative border-b border-line hover:bg-raised"
            >
              <th scope="row" className="py-2.5 font-500">
                <Link
                  to="/gauges/$address"
                  params={{ address: row.address }}
                  className="flex min-w-0 items-center gap-2 text-[13px] text-ink after:absolute after:inset-0 focus-visible:outline-none group-has-[:focus-visible]:bg-raised"
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "size-2 shrink-0 rounded-full",
                      index < 3 ? "bg-accent" : "bg-faint",
                    )}
                  />
                  <span className="truncate">{row.name}</span>
                </Link>
              </th>
              <td className="py-2.5 pl-3 text-[12px] text-secondary max-sm:hidden">
                Boost
              </td>
              <td className="py-2.5 pl-3 text-right text-[13px] font-600 tabular-nums text-ink">
                {formatWholeUsd(row.totalMicro)}
              </td>
              <td className="py-2.5 pl-3 text-right text-[12px] tabular-nums text-pos">
                {row.fundedTokens} / {row.tokenCount}
              </td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  )
}

/** Opens any address on the chain explorer (no watch mode yet). */
function InspectAddress(): ReactElement {
  const { chainId } = useNetwork()
  const explorer = usePublicClient({ chainId })?.chain?.blockExplorers?.default
    .url
  const [value, setValue] = useState("")
  const valid = isAddress(value)

  return (
    <form
      className="flex items-center gap-2 rounded-lg bg-inset py-2 pl-4 pr-2 focus-within:ring-2 focus-within:ring-accent/30"
      onSubmit={(event) => {
        event.preventDefault()
        if (!valid || !explorer) return
        window.open(`${explorer}/address/${value}`, "_blank", "noopener")
      }}
    >
      <Search
        size={16}
        strokeWidth={1.75}
        aria-hidden="true"
        className="shrink-0 text-secondary"
      />
      <input
        value={value}
        onChange={(event) => setValue(event.target.value.trim())}
        placeholder="Inspect address"
        aria-label="Inspect address"
        autoComplete="off"
        spellCheck={false}
        aria-invalid={value !== "" && !valid}
        className="h-9 min-w-0 flex-1 bg-transparent text-[13px] text-ink placeholder:text-muted focus:outline-none"
      />
      <Button
        type="submit"
        variant="secondary"
        size="lg"
        className="h-9 rounded-md px-3.5 font-500"
        disabled={!valid || !explorer}
      >
        Inspect
      </Button>
    </form>
  )
}
