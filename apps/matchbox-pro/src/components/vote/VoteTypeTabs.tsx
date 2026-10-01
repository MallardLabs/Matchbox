import type { ReactElement } from "react"

const upcoming = [
  {
    title: "Validator Voting",
    short: "Validators",
    sub: "veBTC  →  validators",
    subTone: "text-secondary",
  },
  {
    title: "Pools",
    short: "Pools",
    sub: "Non-staking gauges",
    subTone: "text-faint",
  },
]

export default function VoteTypeTabs(): ReactElement {
  return (
    <>
      <ul
        aria-label="Voting types"
        className="flex h-[42px] gap-0.5 rounded-[9px] bg-inset-2 p-[3px] md:hidden"
      >
        <li
          aria-current="true"
          className="flex flex-1 items-center justify-center rounded-[7px] bg-surface text-[12px] font-650 text-ink shadow-knob"
        >
          veMEZO boost
        </li>
        {upcoming.map((type) => (
          <li
            key={type.title}
            aria-disabled="true"
            className="flex flex-1 items-center justify-center gap-1 text-[12px] font-500 text-muted"
          >
            {type.short}
            <span aria-hidden="true" className="size-1 rounded-full bg-faint" />
            <span className="sr-only">Coming soon</span>
          </li>
        ))}
      </ul>
      <ul
        aria-label="Voting types"
        className="hidden gap-2.5 pb-[26px] md:flex"
      >
        <li
          aria-current="true"
          className="flex h-16 min-w-0 flex-1 flex-col gap-0.5 rounded-lg border-[1.5px] border-accent bg-accent-soft px-3 py-2.5"
        >
          <p className="truncate text-[14px] font-650 text-ink">
            veMEZO Voting
          </p>
          <p className="truncate text-[12px] font-500 text-secondary">
            Boost veBTC gauges
          </p>
        </li>
        {upcoming.map((type) => (
          <li
            key={type.title}
            aria-disabled="true"
            className="flex h-16 min-w-0 flex-1 flex-col gap-0.5 rounded-lg border border-line bg-inset px-3 py-2.5"
          >
            <p className="flex items-center justify-between gap-2">
              <span className="truncate text-[14px] font-550 text-muted">
                {type.title}
              </span>
              <span className="shrink-0 text-[11px] font-650 text-accent-ink">
                Coming soon
              </span>
            </p>
            <p className={`truncate text-[12px] font-500 ${type.subTone}`}>
              {type.sub}
            </p>
          </li>
        ))}
      </ul>
    </>
  )
}
