import Button from "@/components/ui/Button"
import type { OverviewState } from "@/lib/overview"
import { Plus } from "lucide-react"
import type { ReactElement, ReactNode } from "react"

type MyLocksProps = {
  state: Exclude<OverviewState, "disconnected">
  onNewLock: () => void
  onRetry: () => void
  children: ReactNode
}

/** J01 "My Locks": heading, then one row of lock tiles per escrow. */
export default function MyLocks({
  state,
  onNewLock,
  onRetry,
  children,
}: MyLocksProps): ReactElement {
  return (
    <section aria-labelledby="my-locks" className="flex flex-col gap-4">
      <header className="flex items-center justify-between gap-4">
        <h2
          id="my-locks"
          className="text-[17px] font-700 text-ink md:text-[24px]"
        >
          My locks
        </h2>
        <button
          type="button"
          onClick={onNewLock}
          className="-mr-2 flex h-8 items-center gap-1.5 rounded-md px-2 text-[13px] font-550 text-secondary md:text-[14px] transition-colors hover:bg-inset hover:text-ink"
        >
          <Plus size={14} strokeWidth={1.75} aria-hidden="true" />
          New lock
        </button>
      </header>

      {state === "loading" ? (
        <LocksSkeleton />
      ) : state === "error" ? (
        <Notice
          role="alert"
          title="Locks unavailable"
          action={
            <Button
              variant="secondary"
              size="lg"
              className="h-9"
              onClick={onRetry}
            >
              Try again
            </Button>
          }
        />
      ) : state === "empty" ? (
        <Notice
          title="No locks"
          action={
            <Button
              size="lg"
              className="h-9 rounded-md px-3.5 font-600"
              onClick={onNewLock}
            >
              New lock
            </Button>
          }
        />
      ) : (
        children
      )}
    </section>
  )
}

export function LockGroup({
  label,
  children,
}: {
  label: string
  children: ReactNode
}): ReactElement {
  return (
    <section aria-label={`${label} locks`} className="flex flex-col gap-2.5">
      <h3 className="text-[13px] font-500 text-secondary md:text-[15px]">
        {label}
      </h3>
      <ul className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-2.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:snap-none md:flex-wrap md:gap-3.5 md:overflow-visible md:px-0 md:pb-0">
        {children}
      </ul>
    </section>
  )
}

function Notice({
  title,
  action,
  role,
}: {
  title: string
  action: ReactNode
  role?: "alert"
}): ReactElement {
  return (
    <div
      role={role}
      className="flex flex-col items-start gap-3 rounded-lg border border-line-2 bg-inset p-5"
    >
      <p className="text-balance text-[16px] font-600 text-ink">{title}</p>
      {action}
    </div>
  )
}

function LocksSkeleton(): ReactElement {
  return (
    <div aria-label="Loading locks" className="flex flex-col gap-2.5">
      <div className="h-5 w-12 rounded bg-inset" />
      <div className="flex gap-2.5 overflow-hidden md:flex-wrap md:gap-3.5">
        {[0, 1, 2].map((item) => (
          <div
            key={item}
            className="flex h-[208px] w-[196px] animate-pulse flex-col rounded-[13px] bg-inset px-3.5 pb-3.5 pt-4 motion-reduce:animate-none"
          >
            <div className="h-5 w-24 rounded bg-inset-2" />
            <div className="mt-[18px] h-2 w-16 rounded bg-inset-2" />
            <div className="mt-1.5 h-4 w-28 rounded bg-inset-2" />
            <div className="mt-auto h-px bg-inset-2" />
            <div className="mt-2.5 h-3.5 w-10 rounded bg-inset-2" />
            <div className="mt-1.5 h-3 w-24 rounded bg-inset-2" />
          </div>
        ))}
      </div>
    </div>
  )
}
