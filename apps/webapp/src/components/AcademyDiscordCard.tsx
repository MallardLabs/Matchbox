import { useDiscordLink } from "@/hooks/useDiscordLink"
import { useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
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

export default function AcademyDiscordCard({ walletAddress }: Props) {
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

  return (
    <div className="h-full rounded-xl border border-brand/30 bg-brand/5 p-5 shadow-sm">
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
