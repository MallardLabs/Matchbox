import {
  ArrowDownLeftIcon,
  ArrowUpRightIcon,
  CopyIcon,
  FilterIcon,
} from "@/components/ui/Icons"
import { StatusBadge } from "@/components/ui/StatusBadge"
import { TokenMark } from "@/components/ui/TokenMark"
import type { QueryBlock } from "@/lib/query/contracts"
import { Money } from "@thesis-co/cent"
import { useMemo, useState } from "react"

type BridgeBlock = Extract<QueryBlock, { type: "bridge_records" }>

function usd(value: string): string {
  return Money(`USD ${value}`).toString()
}

const dateTime = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC",
  timeZoneName: "short",
})

function shortHash(hash: string) {
  return `${hash.slice(0, 6)}…${hash.slice(-4)}`
}

export function BridgeRecords({ block }: { block: BridgeBlock }) {
  const [direction, setDirection] = useState<"all" | "in" | "out">("all")
  const [sort, setSort] = useState<"newest" | "value">("newest")
  const [copiedHash, setCopiedHash] = useState<string | null>(null)

  const records = useMemo(() => {
    const filtered =
      direction === "all"
        ? block.records
        : block.records.filter((record) => record.direction === direction)
    return [...filtered].sort((left, right) =>
      sort === "newest"
        ? Date.parse(right.happenedAt) - Date.parse(left.happenedAt)
        : Money(`USD ${right.usdValue}`).compare(Money(`USD ${left.usdValue}`)),
    )
  }, [block.records, direction, sort])

  const total = records.reduce(
    (sum, record) => sum.add(Money(`USD ${record.usdValue}`)),
    Money("USD 0"),
  )

  function copyHash(hash: string) {
    void navigator.clipboard.writeText(hash).then(() => setCopiedHash(hash))
  }

  return (
    <section
      aria-labelledby="bridge-records-title"
      className="border-t border-line pt-5"
    >
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="mb-1 text-xs font-medium uppercase text-muted">
            Linked journeys
          </p>
          <h2
            className="text-balance text-lg font-medium text-ink"
            id="bridge-records-title"
          >
            {records.length} bridge transactions · {total.toString()}
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex min-h-10 items-center rounded-md border border-line bg-panel p-1">
            {(["all", "in", "out"] as const).map((value) => (
              <button
                aria-pressed={direction === value}
                className={`min-h-8 rounded px-3 text-xs font-medium ${
                  direction === value
                    ? "bg-subtle text-ink"
                    : "text-muted hover:text-ink"
                }`}
                key={value}
                onClick={() => setDirection(value)}
                type="button"
              >
                {value === "in"
                  ? "Into Mezo"
                  : value === "out"
                    ? "Out of Mezo"
                    : "All"}
              </button>
            ))}
          </div>
          <label className="relative">
            <span className="sr-only">Sort bridge transactions</span>
            <FilterIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <select
              aria-label="Sort bridge transactions"
              className="field appearance-none py-0 pl-9 pr-8"
              onChange={(event) =>
                setSort(event.target.value as "newest" | "value")
              }
              value={sort}
            >
              <option value="newest">Newest first</option>
              <option value="value">Highest value</option>
            </select>
          </label>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-line bg-panel">
        {records.map((record) => (
          <article
            className="grid gap-4 border-b border-line p-4 last:border-b-0 md:grid-cols-[minmax(0,1.45fr)_minmax(190px,.7fr)_auto] md:items-center"
            key={record.id}
          >
            <div className="flex min-w-0 items-center gap-3">
              <div className="relative flex shrink-0 items-center">
                <TokenMark token={record.sourceAsset} />
                <TokenMark
                  className="-ml-2 ring-2 ring-panel"
                  token={record.destinationAsset}
                />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-ink">
                    {record.sourceAsset} → {record.destinationAsset}
                  </span>
                  <StatusBadge status={record.status} />
                </div>
                <div className="mt-1 flex items-center gap-1.5 text-xs text-muted">
                  {record.direction === "in" ? (
                    <ArrowDownLeftIcon className="size-3.5 text-positive" />
                  ) : (
                    <ArrowUpRightIcon className="size-3.5 text-warning" />
                  )}
                  <span className="truncate">
                    {record.sourceChain} → {record.destinationChain} ·{" "}
                    {record.provider}
                  </span>
                </div>
              </div>
            </div>

            <div className="min-w-0 md:text-right">
              <p className="font-mono text-sm tabular-nums text-ink">
                {record.sourceAmount} {record.sourceAsset}
              </p>
              <p className="mt-1 text-xs tabular-nums text-muted">
                {usd(record.usdValue)} · {usd(record.feeUsd)} fee
              </p>
            </div>

            <div className="flex items-center justify-between gap-3 md:block md:text-right">
              <p className="text-xs tabular-nums text-secondary">
                {dateTime.format(new Date(record.happenedAt))}
              </p>
              <div className="mt-1 flex items-center gap-1 md:justify-end">
                <span className="font-mono text-xs text-muted">
                  {shortHash(record.sourceHash)}
                </span>
                <button
                  aria-label={`Copy source transaction ${record.sourceHash}`}
                  className="inline-flex size-11 items-center justify-center rounded text-muted hover:bg-raised hover:text-ink md:size-8"
                  onClick={() => copyHash(record.sourceHash)}
                  title={
                    copiedHash === record.sourceHash
                      ? "Copied"
                      : "Copy transaction hash"
                  }
                  type="button"
                >
                  <CopyIcon className="size-3.5" />
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
