import dynamic from "next/dynamic"
import { useRouter } from "next/router"
import { useCallback, useEffect, useState } from "react"
import { useAccount, useSignMessage } from "wagmi"

const ConnectWalletDrawer = dynamic(
  () =>
    import("@/components/ConnectWalletDrawer").then(
      (mod) => mod.ConnectWalletDrawer,
    ),
  { ssr: false },
)

const FUNCTIONS_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/functions/v1/discord-link`
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""

function functionHeaders(): HeadersInit {
  return { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` }
}

type Session =
  | { status: "loading" }
  | { status: "invalid"; reason: string }
  | {
      status: "ready"
      discordUsername: string | null
      discordGlobalName: string | null
      avatarUrl: string
    }

type SemesterResult = {
  semesterId: string
  label: string
  qualifies: boolean
  points: number
}

type VerifyResult = {
  wallet: string
  semesters: SemesterResult[]
  pointsAvailable: boolean
}

type Phase = "idle" | "signing" | "verifying"

function reasonToMessage(reason: string | undefined): string {
  switch (reason) {
    case "not_found":
      return "This link doesn't exist or has already been used."
    case "expired":
      return "This link has expired."
    case "used":
      return "This link has already been used."
    case "wallet_taken":
      return "This wallet is already linked to a different Discord account."
    case "bad_signature":
      return "We couldn't verify the signature. Please try again."
    case "bad_address":
      return "Something's wrong with that wallet address."
    default:
      return "Something went wrong. Please try again."
  }
}

function truncate(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

function ShieldIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      className="h-3.5 w-3.5"
      aria-hidden="true"
    >
      <path
        d="M8 1.5L2.5 4v4c0 2.8 2.2 5.4 5.5 6C11.3 13.4 13.5 10.8 13.5 8V4L8 1.5z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path
        d="M5.5 8l1.5 1.5L10.5 6"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function ActivityIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      className="h-3.5 w-3.5"
      aria-hidden="true"
    >
      <path
        d="M2 11l3-5 3 3 2-4 3 3"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function BadgeIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      className="h-3.5 w-3.5"
      aria-hidden="true"
    >
      <circle cx="8" cy="5.5" r="2.5" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M3 13.5c0-2.5 2.2-4.5 5-4.5s5 2 5 4.5"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  )
}

function CheckCircleIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden="true">
      <path
        d="M4 10l5 5L16 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function WalletIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      className="h-3.5 w-3.5"
      aria-hidden="true"
    >
      <rect
        x="1.5"
        y="4.5"
        width="13"
        height="9"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <path d="M1.5 7.5h13" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="11.5" cy="10" r="1" fill="currentColor" />
    </svg>
  )
}

function SmallCheckIcon() {
  return (
    <svg viewBox="0 0 12 12" fill="none" className="h-3 w-3" aria-hidden="true">
      <path
        d="M2 6l3 3 5-5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

const PERMISSIONS = [
  { Icon: ShieldIcon, label: "Verify you own this wallet address" },
  { Icon: ActivityIcon, label: "Read your Mezo Academy activity" },
  { Icon: BadgeIcon, label: "Assign your Discord roles automatically" },
] as const

export default function LinkWalletPage(): JSX.Element {
  const router = useRouter()
  const token = typeof router.query.token === "string" ? router.query.token : ""

  const { address, isConnected } = useAccount()
  const { signMessageAsync } = useSignMessage()

  const [session, setSession] = useState<Session>({ status: "loading" })
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [phase, setPhase] = useState<Phase>("idle")
  const [result, setResult] = useState<VerifyResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!router.isReady) return
    if (!token) {
      setSession({ status: "invalid", reason: "not_found" })
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(
          `${FUNCTIONS_URL}?action=session&token=${encodeURIComponent(token)}`,
          { headers: functionHeaders() },
        )
        const data = await res.json()
        if (cancelled) return
        if (!data.success) {
          setSession({ status: "invalid", reason: data.reason })
          return
        }
        setSession({
          status: "ready",
          discordUsername: data.discordUsername,
          discordGlobalName: data.discordGlobalName,
          avatarUrl: data.avatarUrl,
        })
      } catch (_err) {
        if (!cancelled) setSession({ status: "invalid", reason: "not_found" })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [router.isReady, token])

  const handleVerify = useCallback(async () => {
    if (!address) return
    setError(null)
    setPhase("signing")
    try {
      const msgRes = await fetch(
        `${FUNCTIONS_URL}?action=message&token=${encodeURIComponent(token)}&address=${address}`,
        { headers: functionHeaders() },
      )
      const msgData = await msgRes.json()
      if (!msgData.success) {
        setError(reasonToMessage(msgData.reason))
        setPhase("idle")
        return
      }

      const signature = await signMessageAsync({ message: msgData.message })

      setPhase("verifying")
      const verifyRes = await fetch(`${FUNCTIONS_URL}?action=verify`, {
        method: "POST",
        headers: { ...functionHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ token, address, signature }),
      })
      const verifyData = await verifyRes.json()
      if (!verifyData.success) {
        setError(reasonToMessage(verifyData.reason))
        setPhase("idle")
        return
      }
      setResult({
        wallet: verifyData.wallet,
        semesters: verifyData.semesters ?? [],
        pointsAvailable: verifyData.pointsAvailable,
      })
      setPhase("idle")
    } catch (err) {
      const message =
        err instanceof Error && /reject|denied/i.test(err.message)
          ? "You rejected the signature request."
          : "Something went wrong. Please try again."
      setError(message)
      setPhase("idle")
    }
  }, [address, token, signMessageAsync])

  const inFlight = phase !== "idle"

  const displayName =
    session.status === "ready"
      ? (session.discordGlobalName ?? session.discordUsername ?? null)
      : null
  const discordHandle =
    session.status === "ready" ? session.discordUsername : null

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        {session.status === "loading" && (
          <div className="flex justify-center py-16">
            <span className="h-7 w-7 animate-spin rounded-full border-[3px] border-[var(--surface-secondary)] border-t-brand" />
          </div>
        )}

        {session.status === "invalid" && (
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-8 py-10 shadow-lg">
            <div className="mb-5 inline-flex items-center rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] px-3 py-1.5">
              <span className="text-xs font-semibold tracking-wider text-[var(--content-primary)] uppercase">
                Matchbox
              </span>
            </div>
            <h1 className="text-base font-semibold text-[var(--content-primary)]">
              This link is unavailable
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-[var(--content-secondary)]">
              {reasonToMessage(session.reason)}
            </p>
            <p className="mt-5 text-xs text-[var(--content-tertiary)]">
              Run{" "}
              <code className="rounded bg-[var(--surface-secondary)] px-1.5 py-0.5 text-[var(--content-secondary)]">
                /matchbox
              </code>{" "}
              in the Mezo Discord to get a fresh link.
            </p>
          </div>
        )}

        {session.status === "ready" &&
          (!result ? (
            <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-lg">
              {/* Matchbox brand header */}
              <div className="flex items-center gap-2.5 px-6 pt-5 pb-4">
                <img
                  src="/matchbox_icon.png"
                  alt="Matchbox"
                  width={28}
                  height={28}
                  className="h-7 w-7 rounded-md"
                />
                <span className="text-sm font-bold tracking-wide text-[var(--content-primary)]">
                  Matchbox
                </span>
              </div>

              <div className="border-t border-[var(--border)]" />

              {/* Heading + Authorizing as */}
              <div className="px-6 pt-5 pb-4">
                <h1 className="text-[15px] font-semibold leading-snug text-[var(--content-primary)]">
                  Matchbox wants to connect your wallet
                </h1>

                {(discordHandle ?? displayName) && (
                  <div className="mt-3 flex items-center gap-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] px-3 py-2">
                    <img
                      src={session.avatarUrl}
                      alt=""
                      width={28}
                      height={28}
                      className="h-7 w-7 flex-shrink-0 rounded-full"
                    />
                    <div className="min-w-0">
                      <p className="text-[11px] leading-none text-[var(--content-muted)]">
                        Authorizing as
                      </p>
                      <p className="mt-0.5 truncate text-xs font-semibold leading-none text-[var(--content-primary)]">
                        {displayName ?? discordHandle}
                        {discordHandle &&
                          displayName &&
                          displayName !== discordHandle && (
                            <span className="ml-1 font-normal text-[var(--content-tertiary)]">
                              @{discordHandle}
                            </span>
                          )}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="border-t border-[var(--border)]" />

              {/* Permissions */}
              <div className="px-6 py-4">
                <p className="mb-3 text-[11px] font-medium uppercase tracking-wider text-[var(--content-muted)]">
                  This will allow Matchbox to
                </p>
                <ul className="space-y-2.5">
                  {PERMISSIONS.map(({ Icon, label }) => (
                    <li key={label} className="flex items-center gap-3">
                      <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-brand/10 text-brand">
                        <Icon />
                      </span>
                      <span className="text-sm text-[var(--content-secondary)]">
                        {label}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="border-t border-[var(--border)]" />

              {/* Wallet + CTA */}
              <div className="px-6 pb-6 pt-4">
                {isConnected && address && (
                  <div className="mb-3 flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] px-3 py-2">
                    <div className="flex items-center gap-2 text-[var(--content-secondary)]">
                      <WalletIcon />
                      <code className="text-xs text-[var(--content-primary)]">
                        {truncate(address)}
                      </code>
                    </div>
                    <button
                      type="button"
                      onClick={() => setDrawerOpen(true)}
                      className="text-[11px] text-[var(--content-tertiary)] transition-colors hover:text-[var(--content-primary)]"
                    >
                      Change
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  onClick={
                    isConnected && address
                      ? handleVerify
                      : () => setDrawerOpen(true)
                  }
                  disabled={inFlight}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {!isConnected || !address ? (
                    "Connect a wallet"
                  ) : phase === "signing" ? (
                    <>
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      Waiting for signature…
                    </>
                  ) : phase === "verifying" ? (
                    <>
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      Linking wallet…
                    </>
                  ) : (
                    "Authorize"
                  )}
                </button>

                {error && (
                  <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/[0.08] px-3 py-2 text-center text-xs text-red-500">
                    {error}
                  </p>
                )}

                <p className="mt-3 text-center text-[11px] leading-relaxed text-[var(--content-muted)]">
                  By authorizing, you confirm you own this wallet.
                </p>
              </div>
            </div>
          ) : (
            /* Success */
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-8 py-9 text-center shadow-lg">
              <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-brand/10 text-brand">
                <CheckCircleIcon />
              </div>

              <h2 className="text-[15px] font-semibold text-[var(--content-primary)]">
                Wallet linked
              </h2>
              <p className="mt-1.5 text-sm text-[var(--content-secondary)]">
                <code className="rounded bg-[var(--surface-secondary)] px-1.5 py-0.5 text-xs">
                  {truncate(result.wallet)}
                </code>{" "}
                is now connected
                {displayName ? (
                  <>
                    {" "}
                    to{" "}
                    <span className="font-medium text-[var(--content-primary)]">
                      {displayName}
                    </span>
                  </>
                ) : null}
                .
              </p>

              {result.pointsAvailable && result.semesters.length > 0 && (
                <div className="mt-5 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-secondary)] text-left">
                  {result.semesters.map((s) => (
                    <div
                      key={s.semesterId}
                      className="flex items-center justify-between px-4 py-3 [&+&]:border-t [&+&]:border-[var(--border)]"
                    >
                      <span className="text-sm font-medium text-[var(--content-primary)]">
                        {s.label}
                      </span>
                      <span className="flex items-center gap-2 text-xs">
                        <span className="text-[var(--content-secondary)]">
                          {s.points.toLocaleString()} pts
                        </span>
                        {s.qualifies ? (
                          <span className="flex items-center gap-1 text-[var(--positive)]">
                            <SmallCheckIcon />
                            Role granted
                          </span>
                        ) : (
                          <span className="text-[var(--content-tertiary)]">
                            Not eligible
                          </span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {!result.pointsAvailable && (
                <p className="mt-4 text-sm text-[var(--content-secondary)]">
                  Your role will be synced shortly.
                </p>
              )}

              <p className="mt-5 text-sm text-[var(--content-tertiary)]">
                You can close this tab and return to Discord.
              </p>
            </div>
          ))}
      </div>

      <ConnectWalletDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
    </div>
  )
}
