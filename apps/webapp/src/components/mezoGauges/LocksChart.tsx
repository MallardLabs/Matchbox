import { epochStartFor } from "@/lib/mezoGauges/epochs"
import type { MezoGaugesLocks } from "@/lib/mezoGauges/schema"
import { Card, Skeleton, Tag } from "@mezo-org/mezo-clay"

import { SectionError } from "./shared"

function formatWeek(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  })
}

export function LocksChart({
  locks,
  isLoading,
  error,
}: {
  locks: MezoGaugesLocks | undefined
  isLoading: boolean
  error: Error | null
}): JSX.Element {
  const currentEpochStart = epochStartFor(Math.floor(Date.now() / 1000))
  const max = Math.max(1, ...(locks?.weekly.map((w) => w.count) ?? [1]))

  return (
    <section aria-labelledby="mezo-gauges-locks">
      <Card title="New veMEZO locks" withBorder overrides={{}}>
        <h2
          id="mezo-gauges-locks"
          className="py-2 text-sm font-medium text-[var(--content-secondary)]"
        >
          Locks created per epoch week
        </h2>
        {isLoading ? (
          <Skeleton width="100%" height="140px" animation />
        ) : error || !locks ? (
          <SectionError message="Unable to load lock stats." />
        ) : (
          <>
            <ul className="m-0 flex list-none items-end gap-2 p-0 pb-2">
              {locks.weekly.map((week) => {
                const partial = week.epochStart === currentEpochStart
                return (
                  <li
                    key={week.epochStart}
                    className="flex min-w-0 flex-1 flex-col items-center gap-1"
                  >
                    <span className="font-mono text-2xs tabular-nums text-[var(--content-secondary)]">
                      {week.count}
                    </span>
                    <span
                      className="block w-full rounded-t bg-[#F7931A]"
                      style={{
                        height: `${Math.max(4, (week.count / max) * 96)}px`,
                        opacity: partial ? 0.5 : 1,
                      }}
                      role="img"
                      aria-label={`${week.count} locks in week starting ${formatWeek(week.epochStart)}${partial ? " (partial)" : ""}`}
                    />
                    <span className="text-2xs text-[var(--content-tertiary)]">
                      {formatWeek(week.epochStart)}
                      {partial && (
                        <Tag closeable={false} color="yellow">
                          partial
                        </Tag>
                      )}
                    </span>
                  </li>
                )
              })}
            </ul>
            <p className="m-0 pb-4 text-xs text-[var(--content-secondary)]">
              14d before launch: {locks.pre14d.count} · 14d after:{" "}
              {locks.post14d.count}
            </p>
          </>
        )}
      </Card>
    </section>
  )
}
