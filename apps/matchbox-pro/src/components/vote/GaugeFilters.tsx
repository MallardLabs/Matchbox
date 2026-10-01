import { cn } from "@/lib/cn"
import { ArrowDown, Search } from "lucide-react"
import type { ReactElement, ReactNode } from "react"
import { z } from "zod"
import type { Density, FilterKey, SortKey } from "./model"

const filters: Array<{ key: FilterKey; label: string }> = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "watching", label: "Watching" },
]

const sorts: Array<{ key: SortKey; label: string }> = [
  { key: "apy", label: "APY" },
  { key: "incentives", label: "Incentives" },
  { key: "vebtc", label: "veBTC" },
  { key: "vemezo", label: "veMEZO" },
  { key: "boost", label: "Boost" },
]

const sortKeySchema = z.enum(["apy", "incentives", "vebtc", "vemezo", "boost"])

const densities: Array<{ key: Density; label: string }> = [
  { key: "comfortable", label: "Comfortable" },
  { key: "compact", label: "Compact" },
]

type GaugeFiltersProps = {
  query: string
  filter: FilterKey
  needsBoostOnly: boolean
  sort: SortKey
  density: Density
  onQueryChange: (query: string) => void
  onFilterChange: (filter: FilterKey) => void
  onNeedsBoostChange: (needsBoostOnly: boolean) => void
  onSortChange: (sort: SortKey) => void
  onDensityChange: (density: Density) => void
}

export default function GaugeFilters(props: GaugeFiltersProps): ReactElement {
  const compact = props.density === "compact"
  return (
    <div className={cn("flex flex-col", compact ? "gap-1.5" : "gap-2.5")}>
      <div className="flex items-center gap-2 md:flex-wrap">
        <label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-lg border border-line bg-inset px-3 focus-within:border-line-2 md:h-[34px] md:min-w-[220px] md:rounded-[6px] md:bg-surface md:px-2.5">
          <Search
            size={14}
            strokeWidth={1.75}
            className="shrink-0 text-muted"
          />
          <span className="sr-only">Search gauges or providers</span>
          <input
            type="search"
            value={props.query}
            onChange={(event) => props.onQueryChange(event.target.value)}
            placeholder="Search gauges or providers"
            className="h-full min-w-0 flex-1 bg-transparent text-[13px] font-500 text-ink outline-none placeholder:text-muted"
          />
        </label>
        <fieldset className="hidden h-[34px] items-center rounded-[6px] bg-inset p-[3px] md:flex">
          <legend className="sr-only">Status</legend>
          {filters.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              aria-pressed={props.filter === key}
              onClick={() => props.onFilterChange(key)}
              className={cn(
                "h-7 rounded-[5px] px-2.5 text-[12px]",
                props.filter === key
                  ? "bg-surface font-600 text-ink"
                  : "font-500 text-secondary hover:text-ink",
              )}
            >
              {label}
            </button>
          ))}
        </fieldset>
        <label className="hidden h-[34px] cursor-pointer items-center gap-1.5 rounded-[6px] bg-inset px-2.5 text-[12px] font-500 text-secondary md:flex">
          <input
            type="checkbox"
            checked={props.needsBoostOnly}
            onChange={(event) => props.onNeedsBoostChange(event.target.checked)}
            className="size-3 cursor-pointer appearance-none rounded-[3px] border border-faint bg-surface checked:border-accent checked:bg-accent"
          />
          Needs boost
        </label>
        <label className="relative flex h-10 shrink-0 items-center gap-1 rounded-lg bg-accent-soft px-3 text-[12px] font-650 text-accent-ink md:hidden">
          <span className="sr-only">Sort by</span>
          {sorts.find((option) => option.key === props.sort)?.label}
          <ArrowDown size={12} strokeWidth={2} aria-hidden="true" />
          <select
            value={props.sort}
            onChange={(event) =>
              props.onSortChange(sortKeySchema.parse(event.target.value))
            }
            className="absolute inset-0 cursor-pointer opacity-0"
          >
            {sorts.map(({ key, label }) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="hidden flex-wrap items-center gap-1.5 md:flex">
        <fieldset className="flex flex-wrap items-center gap-1.5">
          <legend className="float-left mr-0.5 text-[12px] font-500 text-muted">
            Sort
          </legend>
          {sorts.map(({ key, label }) => (
            <Chip
              key={key}
              active={props.sort === key}
              onClick={() => props.onSortChange(key)}
              className="px-[9px]"
            >
              {label}
              {props.sort === key ? (
                <ArrowDown size={12} strokeWidth={2} aria-hidden="true" />
              ) : null}
            </Chip>
          ))}
        </fieldset>
        <fieldset className="ml-auto flex items-center gap-1">
          <legend className="float-left mr-0.5 text-[12px] font-500 text-muted">
            Density
          </legend>
          {densities.map(({ key, label }) => (
            <Chip
              key={key}
              active={props.density === key}
              onClick={() => props.onDensityChange(key)}
              className={cn("px-2.5", props.density === key && "font-650")}
            >
              {label}
            </Chip>
          ))}
        </fieldset>
      </div>
    </div>
  )
}

function Chip({
  active,
  onClick,
  className,
  children,
}: {
  active: boolean
  onClick: () => void
  className: string
  children: ReactNode
}): ReactElement {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 items-center gap-1 rounded-[6px] text-[12px]",
        active
          ? "bg-accent-soft font-600 text-accent-ink"
          : "bg-inset font-500 text-secondary hover:text-ink",
        className,
      )}
    >
      {children}
    </button>
  )
}
