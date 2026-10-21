import { cn } from "@repo/ui/cn"
import { Link } from "@tanstack/react-router"
import type { ReactElement } from "react"
import { VOTE_TYPES, VOTE_TYPE_META, type VoteType } from "./model"
import type { VoteSearch } from "./search"

type VoteTypeSelectorProps = {
  active: VoteType
  /** Search params to carry into another type (filters reset, density kept). */
  searchFor: (type: VoteType) => VoteSearch
}

/** Desktop/tablet: three hugging type cards (J04). Phone: segmented tabs (M02). */
export default function VoteTypeSelector({
  active,
  searchFor,
}: VoteTypeSelectorProps): ReactElement {
  return (
    <nav aria-label="Vote type">
      <ul className="m-0 hidden list-none flex-wrap gap-2.5 p-0 md:flex">
        {VOTE_TYPES.map((type) => {
          const meta = VOTE_TYPE_META[type]
          const current = type === active
          return (
            <li key={type}>
              <Link
                to="/vote"
                search={searchFor(type)}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "flex h-16 min-w-[184px] flex-col justify-center gap-0.5 rounded-lg px-3 transition-colors",
                  current
                    ? "border-[1.5px] border-accent bg-accent-soft"
                    : "border border-line bg-inset hover:border-line-2",
                )}
              >
                <span
                  className={cn(
                    "text-body font-400",
                    current ? "text-ink" : "text-secondary",
                  )}
                >
                  {meta.title}
                </span>
                <span className="text-label font-500 text-secondary">
                  {meta.subtitle}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
      <ul className="m-0 grid h-[42px] list-none grid-cols-3 gap-0.5 rounded-[9px] bg-inset-2 p-[3px] md:hidden">
        {VOTE_TYPES.map((type) => {
          const current = type === active
          return (
            <li key={type} className="flex">
              <Link
                to="/vote"
                search={searchFor(type)}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "flex flex-1 items-center justify-center rounded-[7px] text-label transition-colors",
                  current
                    ? "bg-surface font-600 text-ink shadow-knob"
                    : "font-500 text-muted hover:text-ink",
                )}
              >
                {VOTE_TYPE_META[type].mobileLabel}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
