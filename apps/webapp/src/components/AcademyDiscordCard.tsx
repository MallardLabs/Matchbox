import { useDiscordLink } from "@/hooks/useDiscordLink"

// Invite to the Mezo Discord server, where the Matchbox bot lives.
const MEZO_DISCORD_INVITE = "https://discord.mezo.org"

type Props = {
  walletAddress: string
}

export default function AcademyDiscordCard({ walletAddress }: Props) {
  const { data, isLoading } = useDiscordLink(walletAddress)

  return (
    <div className="rounded-xl border border-brand/30 bg-brand/5 p-5 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-brand">
        Discord
      </h2>

      {isLoading ? (
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 animate-pulse rounded-full bg-[var(--surface-secondary)]" />
          <div className="space-y-2">
            <div className="h-3 w-32 animate-pulse rounded bg-[var(--surface-secondary)]" />
            <div className="h-3 w-20 animate-pulse rounded bg-[var(--surface-secondary)]" />
          </div>
        </div>
      ) : data?.linked ? (
        <div className="flex items-center gap-3">
          <img
            src={data.avatarUrl}
            alt=""
            width={48}
            height={48}
            className="h-12 w-12 rounded-full"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="truncate font-semibold text-[var(--content-primary)]">
                {data.discordGlobalName ??
                  data.discordUsername ??
                  "Discord user"}
              </p>
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[var(--positive)]/40 bg-[var(--positive)]/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[var(--positive)]">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--positive)]" />
                Linked
              </span>
            </div>
            {data.discordUsername && (
              <p className="truncate text-sm text-[var(--content-secondary)]">
                @{data.discordUsername}
              </p>
            )}
            <p className="mt-1 text-xs text-[var(--content-tertiary)]">
              Manage with <code>/matchbox</code> in the Mezo server.
            </p>
          </div>
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
