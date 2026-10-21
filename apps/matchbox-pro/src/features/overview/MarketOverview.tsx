import { useConnectDialog } from "@/app/ConnectDialog"
import { useIncentiveDeposits } from "@/features/history/useHistory"
import { useBoostGauges } from "@/hooks/useBoostGauges"
import { useEpoch } from "@/hooks/useEpoch"
import { useBtcPrice, useMezoPrice } from "@/hooks/usePrices"
import { useGaugeProfiles } from "@/hooks/useProfiles"
import { useTopology } from "@/hooks/useTopology"
import { epochLabel } from "@/lib/epoch"
import {
  formatCompactNumber,
  formatCompactUsd,
  formatWholeUsd,
  gaugeDisplayName,
} from "@/lib/overview"
import { referencePriceUsd, tokenUsdMicro } from "@/lib/tokenUsd"
import { useViewer } from "@/lib/viewer"
import * as Button from "@repo/ui/button"
import { cn } from "@repo/ui/cn"
import * as Skeleton from "@repo/ui/skeleton"
import * as Table from "@repo/ui/table"
import { Link } from "@tanstack/react-router"
import { Search } from "lucide-react"
import { type ReactElement, useId, useMemo, useState } from "react"
import type { Address } from "viem"
import EarningsChart from "./EarningsChart"
import { earningsBars } from "./earnings"

type MarketRow = {
  address: Address
  name: string
  totalMicro: bigint
  fundedTokens: number
  tokenCount: number
  unpriced: boolean
}

/** Pen 25: the public incentive market for visitors without a wallet. */
export default function MarketOverview(): ReactElement {
  const { open: openConnect } = useConnectDialog()
  const epoch = useEpoch()
  const topology = useTopology()
  const { gauges, isLoading: loadingGauges, veMezoTotal } = useBoostGauges()
  const { data: profiles } = useGaugeProfiles()
  const btc = useBtcPrice()
  const mezo = useMezoPrice()
  const deposits = useIncentiveDeposits(6)
  const btcPrice = btc.data ?? null
  const mezoPrice = mezo.data ?? null

  const rows = useMemo<MarketRow[]>(() => {
    return (topology.data?.gauges ?? [])
      .map((gauge) => {
        let totalMicro = 0n
        let fundedTokens = 0
        let unpriced = false
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
          if (referencePriceUsd(prices) === null) unpriced = true
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
          unpriced,
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

  const loading =
    topology.isLoading || loadingGauges || btc.isLoading || mezo.isLoading
  const totalMicro = rows.reduce((sum, row) => sum + row.totalMicro, 0n)
  const unpricedCount = rows.filter((row) => row.unpriced).length
  const activeGauges = gauges.filter((gauge) => gauge.isAlive).length
  const votedVeMezo = gauges.reduce((sum, gauge) => sum + gauge.totalWeight, 0n)
  const whole = (amount: bigint) => formatCompactNumber(amount / 10n ** 18n)

  const depositHistory = {
    ...deposits,
    data: deposits.data?.map((item) => ({
      epoch: item.epoch,
      startsAt: item.startsAt,
      usdMicro: item.usdMicro,
    })),
  }
  const bars = earningsBars({
    history: depositHistory,
    epochStart: epoch.epochStart,
    current: loading
      ? { status: "loading" }
      : topology.isError
        ? { status: "unavailable" }
        : { status: "ready", usdMicro: totalMicro },
    next: { status: "unavailable" },
  }).filter((bar) => bar.key !== "next")

  return (
    <div className="flex flex-col gap-7">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
        <div className="flex min-w-0 flex-col gap-2">
          <p className="m-0 flex flex-wrap items-center gap-2 text-body-sm">
            <span className="font-600 text-accent-ink">
              {epochLabel(epoch.epochStart)}
            </span>
            <span aria-hidden="true" className="text-muted">
              ·
            </span>
            <span className="text-secondary">{epoch.label} remaining</span>
          </p>
          <h1 className="m-0 text-balance text-[24px] font-600 leading-tight text-ink md:text-title">
            This epoch's incentive market
          </h1>
        </div>
        <Button.Root
          size="lg"
          className="font-600 max-sm:h-12 max-sm:w-full max-sm:rounded-[10px] max-sm:text-body"
          onClick={openConnect}
        >
          Connect wallet
        </Button.Root>
      </header>

      {topology.isError ? (
        <div
          role="alert"
          className="flex flex-col items-start gap-3 rounded-lg border border-line-2 bg-inset p-5"
        >
          <p className="m-0 text-lead font-600 text-ink">
            Market data unavailable
          </p>
          <Button.Root
            variant="secondary"
            size="lg"
            className="h-9"
            onClick={() => void topology.refetch()}
          >
            Try again
          </Button.Root>
        </div>
      ) : (
        <>
          <dl
            aria-busy={loading || undefined}
            className="m-0 grid grid-cols-2 gap-y-4 border-y border-line py-4 lg:flex lg:items-center"
          >
            <StripMetric
              label="Deposited this epoch"
              value={loading ? null : formatCompactUsd(totalMicro)}
              detail={
                unpricedCount > 0 ? `USD · ${unpricedCount} unpriced` : "USD"
              }
            />
            <StripMetric
              label="Boost gauges"
              value={loading ? null : String(activeGauges)}
              detail="Active this epoch"
            />
            <StripMetric
              label="Funded gauges"
              value={loading ? null : String(rows.length)}
              detail="With incentives"
            />
            <StripMetric
              label="veMEZO voted"
              value={loading ? null : whole(votedVeMezo)}
              detail={loading ? "—" : `of ${whole(veMezoTotal)}`}
            />
          </dl>

          <div className="grid gap-x-6 gap-y-8 xl:grid-cols-[minmax(0,640px)_minmax(0,1fr)]">
            <MarketTable rows={rows.slice(0, 6)} loading={loading} />
            <EarningsChart
              title="Incentives deposited"
              bars={bars}
              legend={[]}
              note={
                deposits.status === "ready"
                  ? deposits.freshness?.state === "stale"
                    ? "Stale"
                    : null
                  : deposits.status === "loading"
                    ? null
                    : "History unavailable"
              }
              busy={loading}
            />
          </div>
        </>
      )}

      <InspectAddress />
    </div>
  )
}

function StripMetric({
  label,
  value,
  detail,
}: {
  label: string
  value: string | null
  detail: string
}): ReactElement {
  return (
    <div className="flex min-w-0 flex-col gap-1 border-line px-5 even:border-l lg:flex-1 lg:border-l lg:first:border-l-0 lg:first:pl-5">
      <dt className="truncate text-caption text-muted">{label}</dt>
      <dd className="m-0 h-7 text-[20px] font-600 leading-7 tabular-nums text-ink">
        {value === null ? <Skeleton.Root className="mt-1 h-5 w-16" /> : value}
      </dd>
      <dd className="m-0 truncate text-caption text-secondary">{detail}</dd>
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
  const captionId = useId()
  return (
    <section aria-labelledby={captionId} className="flex min-w-0 flex-col">
      <h2 id={captionId} className="m-0 pb-3 text-body font-600 text-ink">
        Highest incentives this epoch
      </h2>
      <Table.Root aria-labelledby={captionId} aria-busy={loading || undefined}>
        <Table.Header>
          <tr>
            <Table.Head>Gauge</Table.Head>
            <Table.Head className="w-[88px] max-sm:hidden">Type</Table.Head>
            <Table.Head numeric className="w-[96px]">
              Deposited
            </Table.Head>
            <Table.Head numeric className="w-[64px]">
              Funded
            </Table.Head>
          </tr>
        </Table.Header>
        <Table.Body>
          {loading ? (
            [0, 1, 2, 3, 4].map((item) => (
              <Table.Row key={item}>
                <Table.Cell className="h-[35px]">
                  <Skeleton.Root className="w-40 max-w-full" />
                </Table.Cell>
                <Table.Cell className="max-sm:hidden">
                  <Skeleton.Root className="w-12" />
                </Table.Cell>
                <Table.Cell>
                  <Skeleton.Root className="ml-auto w-16" />
                </Table.Cell>
                <Table.Cell>
                  <Skeleton.Root className="ml-auto w-8" />
                </Table.Cell>
              </Table.Row>
            ))
          ) : rows.length === 0 ? (
            <Table.Row>
              <Table.Cell colSpan={4} className="py-6 text-body font-600">
                No funded gauges
              </Table.Cell>
            </Table.Row>
          ) : (
            rows.map((row, index) => (
              <Table.Row key={row.address} interactive className="relative">
                <th scope="row" className="py-2.5 pr-3 text-left font-500">
                  <Link
                    to="/gauges/$address"
                    params={{ address: row.address }}
                    className="flex min-w-0 items-center gap-2 text-body-sm text-ink after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:outline focus-visible:after:outline-2 focus-visible:after:outline-accent-ink"
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "size-2 shrink-0 rounded-full",
                        index < 3 ? "bg-accent" : "bg-line-2",
                      )}
                    />
                    <span className="truncate">{row.name}</span>
                  </Link>
                </th>
                <Table.Cell className="text-label text-secondary max-sm:hidden">
                  Boost
                </Table.Cell>
                <Table.Cell
                  numeric
                  className="font-sans text-body-sm font-600 text-ink"
                >
                  {formatWholeUsd(row.totalMicro)}
                  {row.unpriced ? (
                    <span className="sr-only"> plus unpriced tokens</span>
                  ) : null}
                </Table.Cell>
                <Table.Cell numeric className="font-sans text-label text-pos">
                  {row.fundedTokens} / {row.tokenCount}
                </Table.Cell>
              </Table.Row>
            ))
          )}
        </Table.Body>
      </Table.Root>
    </section>
  )
}

/** Paste any address to see its Overview read-only (viewer "watching"). */
function InspectAddress(): ReactElement {
  const { watch } = useViewer()
  const [value, setValue] = useState("")
  const [invalid, setInvalid] = useState(false)
  const inputId = useId()
  const hintId = useId()

  return (
    <form
      noValidate
      aria-labelledby={`${inputId}-title`}
      className="flex flex-col gap-3 rounded-lg bg-inset px-4 py-3.5 md:flex-row md:items-center"
      onSubmit={(event) => {
        event.preventDefault()
        if (!watch(value)) setInvalid(true)
      }}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Search
          aria-hidden="true"
          size={16}
          strokeWidth={1.75}
          className="shrink-0 text-secondary"
        />
        <p className="m-0 flex min-w-0 flex-col gap-0.5">
          <label
            id={`${inputId}-title`}
            htmlFor={inputId}
            className="text-body-sm font-500 text-ink"
          >
            Or paste any Mezo address to inspect
          </label>
          <span id={hintId} className="text-label text-secondary">
            {invalid ? (
              <span role="alert" className="text-neg">
                Not a valid address
              </span>
            ) : (
              "Read-only"
            )}
          </span>
        </p>
      </div>
      <div className="flex gap-2">
        <input
          id={inputId}
          value={value}
          onChange={(event) => {
            setValue(event.target.value)
            setInvalid(false)
          }}
          placeholder="0x…"
          autoComplete="off"
          spellCheck={false}
          aria-invalid={invalid || undefined}
          aria-describedby={hintId}
          className="h-9 min-w-0 flex-1 rounded-md border border-line bg-surface px-3 font-mono text-body-sm text-ink placeholder:font-sans placeholder:text-muted aria-[invalid=true]:border-neg md:w-[280px] md:flex-none"
        />
        <Button.Root
          type="submit"
          variant="secondary"
          size="lg"
          className="h-9 px-3.5 font-500"
        >
          Inspect
        </Button.Root>
      </div>
    </form>
  )
}
