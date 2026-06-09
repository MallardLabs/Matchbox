import { useDiscordLink } from "@/hooks/useDiscordLink"
import { useQueryClient } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"
import { useSignMessage } from "wagmi"

// Invite to the Mezo Discord server, where the Matchbox bot lives.
const MEZO_DISCORD_INVITE = "https://discord.mezo.org"
const FUNCTIONS_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/functions/v1/discord-link`
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""

function headers(): HeadersInit {
  return { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` }
}

type Props = {
  walletAddress: string
  compact?: boolean
}

function UnlinkIcon(): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <title>Unlink</title>
      <path d="M9 17H7A5 5 0 0 1 7 7h2" />
      <path d="M15 7h2a5 5 0 0 1 4 8" />
      <line x1="8" y1="12" x2="12" y2="12" />
      <line x1="3" y1="3" x2="21" y2="21" />
    </svg>
  )
}

function DiscordIcon(): JSX.Element {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      fill="currentColor"
      viewBox="0 0 16 16"
      aria-hidden="true"
    >
      <path d="M13.545 2.907a13.2 13.2 0 0 0-3.257-1.011.05.05 0 0 0-.052.025c-.141.25-.297.577-.406.833a12.2 12.2 0 0 0-3.658 0 8 8 0 0 0-.412-.833.05.05 0 0 0-.052-.025c-1.125.194-2.22.534-3.257 1.011a.04.04 0 0 0-.021.018C.356 6.024-.213 9.047.066 12.032q.003.022.021.037a13.3 13.3 0 0 0 3.995 2.02.05.05 0 0 0 .056-.019q.463-.63.818-1.329a.05.05 0 0 0-.01-.059l-.018-.011a9 9 0 0 1-1.248-.595.05.05 0 0 1-.02-.066l.015-.019q.127-.095.248-.195a.05.05 0 0 1 .051-.007c2.619 1.196 5.454 1.196 8.041 0a.05.05 0 0 1 .053.007q.121.1.248.195a.05.05 0 0 1-.004.085 8 8 0 0 1-1.249.594.05.05 0 0 0-.03.03.05.05 0 0 0 .003.041c.24.465.515.909.817 1.329a.05.05 0 0 0 .056.019 13.2 13.2 0 0 0 4.001-2.02.05.05 0 0 0 .021-.037c.334-3.451-.559-6.449-2.366-9.106a.03.03 0 0 0-.02-.019m-8.198 7.307c-.789 0-1.438-.724-1.438-1.612s.637-1.613 1.438-1.613c.807 0 1.45.73 1.438 1.613 0 .888-.637 1.612-1.438 1.612m5.316 0c-.788 0-1.438-.724-1.438-1.612s.637-1.613 1.438-1.613c.807 0 1.451.73 1.438 1.613 0 .888-.631 1.612-1.438 1.612" />
    </svg>
  )
}

function CompactLinkButton({
  discordInvite,
}: { discordInvite: string }): JSX.Element {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-sm font-medium text-brand transition-opacity hover:opacity-80"
      >
        <DiscordIcon />
        Link Discord
      </button>

      {open && (
        <div className="absolute right-0 bottom-full z-20 mb-2 w-64 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-lg">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--content-muted)]">
            How to link
          </p>
          <ol className="space-y-2.5 text-sm text-[var(--content-secondary)]">
            <li className="flex gap-2.5">
              <span className="mt-px shrink-0 font-mono text-xs font-bold text-brand">
                1
              </span>
              <span>Join the Mezo Discord server.</span>
            </li>
            <li className="flex gap-2.5">
              <span className="mt-px shrink-0 font-mono text-xs font-bold text-brand">
                2
              </span>
              <span>
                Run{" "}
                <code className="rounded bg-[var(--surface-secondary)] px-1 py-0.5 text-xs">
                  /matchbox
                </code>{" "}
                in any channel.
              </span>
            </li>
            <li className="flex gap-2.5">
              <span className="mt-px shrink-0 font-mono text-xs font-bold text-brand">
                3
              </span>
              <span>Open the link, connect this wallet, and sign.</span>
            </li>
          </ol>
          <a
            href={discordInvite}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 flex items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white no-underline transition-opacity hover:opacity-90"
          >
            <DiscordIcon />
            Join the Mezo server
          </a>
        </div>
      )}
    </div>
  )
}

export default function AcademyDiscordCard({
  walletAddress,
  compact = false,
}: Props) {
  const { data, isLoading } = useDiscordLink(walletAddress)
  const { signMessageAsync } = useSignMessage()
  const queryClient = useQueryClient()
  const [unlinking, setUnlinking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleUnlink = async () => {
    setError(null)
    setUnlinking(true)
    try {
      const msgRes = await fetch(
        `${FUNCTIONS_URL}?action=unlink-message&address=${walletAddress}`,
        { headers: headers() },
      )
      const msgData = await msgRes.json()
      if (!msgData.success) {
        setError("Couldn't start unlinking. Please try again.")
        return
      }
      const signature = await signMessageAsync({ message: msgData.message })
      const res = await fetch(`${FUNCTIONS_URL}?action=unlink`, {
        method: "POST",
        headers: { ...headers(), "Content-Type": "application/json" },
        body: JSON.stringify({ address: walletAddress, signature }),
      })
      const resData = await res.json()
      if (!resData.success) {
        setError("Unlink failed. Please try again.")
        return
      }
      await queryClient.invalidateQueries({
        queryKey: ["discord-link", walletAddress.toLowerCase()],
      })
    } catch (err) {
      setError(
        err instanceof Error && /reject|denied/i.test(err.message)
          ? "Signature request was rejected."
          : "Couldn't unlink. Please try again.",
      )
    } finally {
      setUnlinking(false)
    }
  }

  if (compact) {
    if (isLoading) {
      return (
        <div className="flex items-center gap-2 text-xs text-[var(--content-muted)]">
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
          <span>Discord</span>
        </div>
      )
    }
    if (data?.linked) {
      return (
        <div className="flex items-center gap-2">
          <img
            src={data.avatarUrl}
            alt=""
            width={24}
            height={24}
            className="h-6 w-6 rounded-full"
          />
          <span className="text-sm font-medium text-[var(--content-primary)]">
            {data.discordGlobalName ?? data.discordUsername ?? "Discord user"}
          </span>
          {data.discordUsername && data.discordGlobalName && (
            <span className="text-xs text-[var(--content-muted)]">
              @{data.discordUsername}
            </span>
          )}
          <span className="group relative">
            <button
              type="button"
              onClick={handleUnlink}
              disabled={unlinking}
              aria-label="Unlink wallet"
              className="flex h-6 w-6 items-center justify-center rounded text-[var(--content-muted)] transition-colors hover:text-[var(--negative)] disabled:opacity-60"
            >
              {unlinking ? (
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                <UnlinkIcon />
              )}
            </button>
            <span
              role="tooltip"
              className="pointer-events-none absolute right-0 top-full z-10 mt-2 w-52 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs leading-relaxed text-[var(--content-secondary)] opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100"
            >
              Unlink — or manage via <code>/matchbox</code> in Mezo.
            </span>
          </span>
          {error && (
            <span className="text-xs text-[var(--negative)]">{error}</span>
          )}
        </div>
      )
    }
    return <CompactLinkButton discordInvite={MEZO_DISCORD_INVITE} />
  }

  return (
    <div className="rounded-xl border border-brand/30 bg-brand/5 p-5 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-brand">
        Discord
      </h2>

      {isLoading ? (
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 animate-pulse rounded-full bg-[var(--surface-secondary)]" />
          <div className="space-y-2">
            <div className="h-3 w-32 animate-pulse rounded bg-[var(--surface-secondary)]" />
            <div className="h-3 w-20 animate-pulse rounded bg-[var(--surface-secondary)]" />
          </div>
        </div>
      ) : data?.linked ? (
        <div>
          <div className="flex items-center gap-3">
            <img
              src={data.avatarUrl}
              alt=""
              width={40}
              height={40}
              className="h-10 w-10 rounded-full"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-[var(--content-primary)]">
                {data.discordGlobalName ??
                  data.discordUsername ??
                  "Discord user"}
              </p>
              {data.discordUsername && (
                <p className="truncate text-sm text-[var(--content-secondary)]">
                  @{data.discordUsername}
                </p>
              )}
            </div>
            <span className="group relative shrink-0">
              <button
                type="button"
                onClick={handleUnlink}
                disabled={unlinking}
                aria-label="Unlink wallet"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--content-secondary)] transition-colors hover:border-[var(--negative)]/50 hover:text-[var(--negative)] disabled:opacity-60"
              >
                {unlinking ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                ) : (
                  <UnlinkIcon />
                )}
              </button>
              <span
                role="tooltip"
                className="pointer-events-none absolute right-0 top-full z-10 mt-2 w-56 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-left text-xs leading-relaxed text-[var(--content-secondary)] opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
              >
                Unlink this wallet — or manage it anytime with{" "}
                <code>/matchbox</code> in the Mezo server.
              </span>
            </span>
          </div>
          {error && (
            <p className="mt-2 text-xs text-[var(--negative)]">{error}</p>
          )}
        </div>
      ) : (
        <div>
          <p className="text-sm text-[var(--content-secondary)]">
            Link your wallet to your Discord account to earn Mezo Academy roles
            in the Mezo server.
          </p>
          <ol className="mt-3 space-y-1.5 text-sm text-[var(--content-secondary)]">
            <li>
              <span className="font-semibold text-[var(--content-primary)]">
                1.
              </span>{" "}
              Join the Mezo Discord server.
            </li>
            <li>
              <span className="font-semibold text-[var(--content-primary)]">
                2.
              </span>{" "}
              Run <code>/matchbox</code> in any channel.
            </li>
            <li>
              <span className="font-semibold text-[var(--content-primary)]">
                3.
              </span>{" "}
              Open the link, connect this wallet, and sign.
            </li>
          </ol>
          <a
            href={MEZO_DISCORD_INVITE}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center justify-center rounded-lg bg-brand px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            Join the Mezo server
          </a>
        </div>
      )}
    </div>
  )
}
