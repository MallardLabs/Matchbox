import * as Button from "@repo/ui/button"
import { cn } from "@repo/ui/cn"
import * as Skeleton from "@repo/ui/skeleton"
import { Plus } from "lucide-react"
import {
  type ReactElement,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react"
import LockCard from "./LockCard"
import { useLockFlows } from "./LockFlows"
import { type LockKind, type LockView, mergePlan } from "./lockModel"

export type MyLocksState = "loading" | "error" | "empty" | "ready"

const GROUPS: LockKind[] = ["veBTC", "veMEZO"]

/**
 * J01 "My locks": one row of tiles per escrow from tablet up; on phones a
 * single swipeable carousel with page dots (M01).
 */
export default function MyLocks({
  state,
  locks,
  nowSeconds,
  onRetry,
}: {
  state: MyLocksState
  locks: LockView[]
  nowSeconds: bigint
  onRetry: () => void
}): ReactElement {
  const { open } = useLockFlows()

  return (
    <section
      aria-labelledby="my-locks-title"
      aria-busy={state === "loading" || undefined}
      className="flex flex-col gap-3 md:gap-4"
    >
      <header className="flex items-center justify-between gap-4">
        <h2
          id="my-locks-title"
          className="m-0 text-[17px] font-700 leading-6 text-ink md:text-[24px] md:leading-8"
        >
          My locks
        </h2>
        <button
          type="button"
          onClick={() => open({ type: "new-lock" })}
          className="-mr-1.5 flex h-8 items-center gap-1 rounded-md px-1.5 text-body-sm font-500 text-secondary transition-colors hover:bg-inset hover:text-ink md:text-body"
        >
          <Plus aria-hidden="true" size={14} strokeWidth={1.75} />
          New lock
        </button>
      </header>

      {state === "loading" ? (
        <LocksSkeleton />
      ) : state === "error" ? (
        <Notice title="Locks unavailable">
          <Button.Root
            variant="secondary"
            size="lg"
            className="h-9"
            onClick={onRetry}
          >
            Try again
          </Button.Root>
        </Notice>
      ) : state === "empty" ? (
        <Notice title="No veMEZO or veBTC locks">
          <Button.Root
            size="lg"
            className="h-9 font-600"
            onClick={() => open({ type: "new-lock" })}
          >
            New lock
          </Button.Root>
        </Notice>
      ) : (
        <LockGroups locks={locks} nowSeconds={nowSeconds} />
      )}
    </section>
  )
}

function LockGroups({
  locks,
  nowSeconds,
}: {
  locks: LockView[]
  nowSeconds: bigint
}): ReactElement {
  const scroller = useRef<HTMLDivElement>(null)
  const [page, setPage] = useState({ index: 0, count: 1 })

  const measure = useCallback(() => {
    const node = scroller.current
    if (!node) return
    const width = node.clientWidth
    if (width === 0) return
    const count = Math.max(1, Math.ceil(node.scrollWidth / width - 0.05))
    const index = Math.min(count - 1, Math.round(node.scrollLeft / width))
    setPage((current) =>
      current.index === index && current.count === count
        ? current
        : { index, count },
    )
  }, [])

  useEffect(() => {
    const node = scroller.current
    if (!node) return
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [measure])

  const groups = GROUPS.map((kind) => ({
    kind,
    locks: locks.filter((lock) => lock.kind === kind),
  })).filter((group) => group.locks.length > 0)

  return (
    <div className="flex flex-col gap-3">
      <div
        ref={scroller}
        onScroll={measure}
        className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-2.5 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:snap-none md:flex-col md:gap-[22px] md:overflow-visible md:px-0 [&::-webkit-scrollbar]:hidden"
      >
        {groups.map((group) => (
          <section
            key={group.kind}
            aria-labelledby={`locks-${group.kind}`}
            className="contents md:flex md:flex-col md:gap-2.5"
          >
            <h3
              id={`locks-${group.kind}`}
              className="m-0 text-nav font-500 text-secondary max-md:sr-only"
            >
              {group.kind}
            </h3>
            <ul className="contents md:m-0 md:flex md:list-none md:flex-wrap md:gap-3.5 md:p-0">
              {group.locks.map((lock) => (
                <li key={lock.key} className="shrink-0 list-none snap-start">
                  <LockCard
                    lock={lock}
                    nowSeconds={nowSeconds}
                    canMerge={locks.some((other) => mergePlan(lock, other).ok)}
                  />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      {page.count > 1 ? (
        <div aria-hidden="true" className="flex justify-center gap-1 md:hidden">
          {Array.from({ length: page.count }, (_, index) => (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: page dots are positional.
              key={index}
              className={cn(
                "h-1 rounded-sm transition-[width,background-color]",
                index === page.index ? "w-4 bg-ink" : "w-1 bg-line-2",
              )}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

function Notice({
  title,
  children,
}: {
  title: string
  children: ReactNode
}): ReactElement {
  return (
    <div className="flex min-h-[120px] flex-col items-start gap-3 rounded-lg border border-line-2 bg-inset p-5 md:min-h-[160px]">
      <p className="m-0 text-lead font-600 text-ink">{title}</p>
      {children}
    </div>
  )
}

function LocksSkeleton(): ReactElement {
  return (
    <div className="flex gap-2.5 overflow-hidden md:flex-wrap md:gap-3.5">
      {[0, 1, 2].map((item) => (
        <div
          key={item}
          className="flex h-[168px] w-[156px] shrink-0 flex-col rounded-[13px] border border-line px-3.5 pb-3.5 pt-4 md:h-[208px] md:w-[196px]"
        >
          <Skeleton.Root className="h-5 w-24" />
          <Skeleton.Root className="mt-[18px] h-2 w-16" />
          <Skeleton.Root className="mt-1.5 h-4 w-28" />
          <span className="mt-auto h-px bg-line" />
          <Skeleton.Root className="mt-2.5 h-3.5 w-10" />
          <Skeleton.Root className="mt-1.5 h-3 w-24" />
        </div>
      ))}
    </div>
  )
}
