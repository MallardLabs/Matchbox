import type { DeviceSession } from "@repo/platform-contracts/identity"
import * as Button from "@repo/ui/button"
import { cn } from "@repo/ui/cn"
import * as Skeleton from "@repo/ui/skeleton"
import * as Toast from "@repo/ui/toast"
import { useNavigate } from "@tanstack/react-router"
import type { ReactElement } from "react"
import { formatDateTime } from "../../lib/format"
import { useDeviceSessions, useRevokeSession } from "../../lib/queries"
import { describeUserAgent } from "../../lib/user-agent"

const sessionGrid =
  "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 md:grid-cols-[minmax(0,1fr)_140px_180px_80px]"

function SessionRow({ session }: { session: DeviceSession }): ReactElement {
  const revoke = useRevokeSession()
  const navigate = useNavigate()
  const { toast } = Toast.useToast()
  const device = describeUserAgent(session.userAgent)
  const lastSeen = session.lastSeenAt ?? session.createdAt
  return (
    <li
      className={cn(sessionGrid, "border-b border-line py-3 last:border-b-0")}
    >
      <p className="flex min-w-0 flex-wrap items-center gap-2 text-body font-600 text-ink">
        <span className="truncate">{device}</span>
        {session.current ? (
          <span className="text-label font-500 text-secondary">
            This device
          </span>
        ) : null}
      </p>
      <div className="col-span-2 row-start-2 flex flex-wrap gap-x-3 text-label text-secondary md:contents">
        <span className="font-mono md:col-start-2 md:row-start-1">
          <span className="sr-only">IP </span>
          {session.ipPrefix ?? "—"}
        </span>
        <span className="md:col-start-3 md:row-start-1">
          <span className="md:sr-only">Last seen </span>
          <time dateTime={lastSeen} className="tabular-nums">
            {formatDateTime(lastSeen)}
          </time>
        </span>
      </div>
      <div className="col-start-2 row-start-1 flex justify-end md:col-start-4">
        <Button.Root
          variant="ghost"
          size="sm"
          loading={revoke.isPending}
          aria-label={
            session.current
              ? "Sign out this device"
              : `Revoke ${device} session`
          }
          onClick={() =>
            revoke.mutate(
              { id: session.id, current: session.current },
              {
                onSuccess: () => {
                  if (session.current) {
                    void navigate({
                      to: "/sign-in",
                      search: { force: false },
                    })
                  }
                },
                onError: () => toast({ title: "Revoke failed", tone: "error" }),
              },
            )
          }
        >
          {session.current ? "Sign out" : "Revoke"}
        </Button.Root>
      </div>
    </li>
  )
}

/** Signed-in devices for this wallet. */
export default function DeviceSessions(): ReactElement {
  const sessions = useDeviceSessions(true)
  if (sessions.isPending) {
    return (
      <div aria-busy="true" className="flex flex-col gap-3 py-2">
        <output className="sr-only">Loading sessions</output>
        <Skeleton.Root shape="block" className="h-11" />
      </div>
    )
  }
  if (sessions.isError) {
    return (
      <p role="alert" className="py-4 text-body-sm text-neg">
        Couldn’t load sessions
      </p>
    )
  }
  return (
    <div className="flex flex-col">
      <div
        aria-hidden="true"
        className={cn(
          sessionGrid,
          "hidden border-b border-line pb-2 text-caption text-secondary md:grid",
        )}
      >
        <span>Device</span>
        <span>IP</span>
        <span>Last seen</span>
        <span />
      </div>
      <ul aria-label="Sessions" className="m-0 list-none p-0">
        {sessions.data.data.map((session) => (
          <SessionRow key={session.id} session={session} />
        ))}
      </ul>
    </div>
  )
}
