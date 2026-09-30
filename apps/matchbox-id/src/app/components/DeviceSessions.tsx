import type { DeviceSession } from "@repo/platform-contracts/identity"
import * as Badge from "@repo/ui/badge"
import * as Button from "@repo/ui/button"
import * as Card from "@repo/ui/card"
import * as Skeleton from "@repo/ui/skeleton"
import * as Toast from "@repo/ui/toast"
import type { ReactElement } from "react"
import { formatDateTime } from "../lib/format"
import { useDeviceSessions, useRevokeSession } from "../lib/queries"
import { describeUserAgent } from "../lib/user-agent"

function SessionRow({ session }: { session: DeviceSession }): ReactElement {
  const revoke = useRevokeSession()
  const { toast } = Toast.useToast()
  const device = describeUserAgent(session.userAgent)
  const lastSeen = session.lastSeenAt ?? session.createdAt
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 border-t border-line py-3 first:border-t-0">
      <div className="flex min-w-0 flex-col gap-1">
        <p className="flex flex-wrap items-center gap-2 text-[13px] font-600 text-ink">
          {device}
          {session.current ? (
            <Badge.Root tone="pos" dot>
              Current
            </Badge.Root>
          ) : null}
        </p>
        <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] text-secondary">
          <span className="font-mono">{session.ipPrefix ?? "—"}</span>
          <span>
            Last seen{" "}
            <time dateTime={lastSeen} className="tabular-nums">
              {formatDateTime(lastSeen)}
            </time>
          </span>
        </p>
      </div>
      <Button.Root
        variant="ghost"
        size="sm"
        loading={revoke.isPending}
        aria-label={
          session.current ? "Sign out this device" : `Revoke ${device} session`
        }
        onClick={() =>
          revoke.mutate(
            { id: session.id, current: session.current },
            {
              onError: () => toast({ title: "Revoke failed", tone: "error" }),
            },
          )
        }
      >
        {session.current ? "Sign out" : "Revoke"}
      </Button.Root>
    </li>
  )
}

/** Signed-in devices for this wallet. */
export default function DeviceSessions(): ReactElement {
  const sessions = useDeviceSessions(true)
  return (
    <Card.Root variant="panel" aria-busy={sessions.isPending || undefined}>
      <Card.Header>
        <Card.Title>Sessions</Card.Title>
      </Card.Header>
      <Card.Body>
        {sessions.isPending ? (
          <Skeleton.Root shape="block" />
        ) : sessions.isError ? (
          <p role="alert" className="text-[13px] text-neg">
            Couldn’t load sessions
          </p>
        ) : (
          <ul className="m-0 list-none p-0">
            {sessions.data.data.map((session) => (
              <SessionRow key={session.id} session={session} />
            ))}
          </ul>
        )}
      </Card.Body>
    </Card.Root>
  )
}
