import { cn } from "@repo/ui/cn"
import * as Input from "@repo/ui/input"
import * as SegmentedControl from "@repo/ui/segmented-control"
import { ArrowDown, Check, Search } from "lucide-react"
import type { ReactElement } from "react"
import {
  DENSITIES,
  type Density,
  STATUS_FILTERS,
  type SortKey,
  type SortOption,
  type StatusFilter,
} from "./model"

type TargetFiltersProps = {
  query: string
  status: StatusFilter
  needsBoost: boolean
  showNeedsBoost: boolean
  sort: SortKey
  sorts: SortOption[]
  density: Density
  searchLabel: string
  onQueryChange: (query: string) => void
  onStatusChange: (status: StatusFilter) => void
  onNeedsBoostChange: (needsBoost: boolean) => void
  onSortChange: (sort: SortKey) => void
  onDensityChange: (density: Density) => void
}

const STATUS_LABEL: Record<StatusFilter, string> = {
  all: "All",
  active: "Active",
  watching: "Watching",
}

const DENSITY_LABEL: Record<Density, string> = {
  comfortable: "Comfortable",
  compact: "Compact",
}

function isStatus(value: string): value is StatusFilter {
  return STATUS_FILTERS.some((status) => status === value)
}

/** Two rows on tablet and up (J04); search plus a sort picker on phones (M02). */
export default function TargetFilters(props: TargetFiltersProps): ReactElement {
  const activeSort =
    props.sorts.find((option) => option.key === props.sort) ?? props.sorts[0]
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <Input.Group
          size="md"
          className="h-10 flex-1 bg-inset md:h-[34px] md:bg-surface"
        >
          <Input.Adornment>
            <Search aria-hidden="true" size={14} strokeWidth={1.75} />
          </Input.Adornment>
          <Input.Root
            type="search"
            value={props.query}
            onChange={(event) => props.onQueryChange(event.target.value)}
            placeholder={props.searchLabel}
            aria-label={props.searchLabel}
            className="text-body-sm"
          />
        </Input.Group>
        <SegmentedControl.Root
          size="sm"
          aria-label="Status"
          value={props.status}
          onValueChange={(value) => {
            if (isStatus(value)) props.onStatusChange(value)
          }}
          className="hidden bg-inset md:inline-flex"
        >
          {STATUS_FILTERS.map((status) => (
            <SegmentedControl.Item key={status} value={status}>
              {STATUS_LABEL[status]}
            </SegmentedControl.Item>
          ))}
        </SegmentedControl.Root>
        {props.showNeedsBoost ? (
          <label className="hidden h-[34px] cursor-pointer items-center gap-1.5 rounded-[6px] bg-inset px-2.5 text-label font-500 text-secondary hover:text-ink md:flex">
            <input
              type="checkbox"
              checked={props.needsBoost}
              onChange={(event) =>
                props.onNeedsBoostChange(event.target.checked)
              }
              className="peer sr-only"
            />
            <span
              aria-hidden="true"
              className="flex size-3 items-center justify-center rounded-[3px] border border-expired bg-surface text-on-accent peer-checked:border-accent peer-checked:bg-accent peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent-ink"
            >
              {props.needsBoost ? <Check size={9} strokeWidth={3.5} /> : null}
            </span>
            Needs boost
          </label>
        ) : null}
        <label className="relative flex h-10 shrink-0 items-center gap-1 rounded-lg bg-accent-soft px-3 text-label font-600 text-accent-ink focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent-ink md:hidden">
          <span className="sr-only">Sort by</span>
          {activeSort?.label}
          <ArrowDown aria-hidden="true" size={12} strokeWidth={2} />
          <select
            value={props.sort}
            onChange={(event) => {
              const next = props.sorts.find(
                (option) => option.key === event.target.value,
              )
              if (next) props.onSortChange(next.key)
            }}
            className="absolute inset-0 cursor-pointer opacity-0"
          >
            {props.sorts.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="hidden flex-wrap items-center gap-1.5 md:flex">
        <span
          id="vote-sort-label"
          className="mr-0.5 text-label font-500 text-muted"
        >
          Sort
        </span>
        <ul
          aria-labelledby="vote-sort-label"
          className="m-0 flex list-none flex-wrap gap-1.5 p-0"
        >
          {props.sorts.map((option) => {
            const active = option.key === props.sort
            return (
              <li key={option.key}>
                <Chip
                  active={active}
                  onClick={() => props.onSortChange(option.key)}
                >
                  {option.label}
                  {active ? (
                    <ArrowDown aria-hidden="true" size={12} strokeWidth={2} />
                  ) : null}
                  {active ? (
                    <span className="sr-only">, descending</span>
                  ) : null}
                </Chip>
              </li>
            )
          })}
        </ul>
        <span className="flex-1" />
        <span
          id="vote-density-label"
          className="mr-0.5 text-label font-500 text-muted"
        >
          Density
        </span>
        <ul
          aria-labelledby="vote-density-label"
          className="m-0 flex list-none gap-1 p-0"
        >
          {DENSITIES.map((density) => (
            <li key={density}>
              <Chip
                active={density === props.density}
                onClick={() => props.onDensityChange(density)}
              >
                {DENSITY_LABEL[density]}
              </Chip>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactElement | string | Array<ReactElement | string | null>
}): ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex h-7 items-center gap-1 rounded-[6px] px-[9px] text-label transition-colors",
        active
          ? "bg-accent-soft font-600 text-accent-ink"
          : "bg-inset font-500 text-secondary hover:text-ink",
      )}
    >
      {children}
    </button>
  )
}
