import dynamic from "next/dynamic"
import { useRouter } from "next/router"
import { Fragment, useCallback, useEffect, useState } from "react"
import { useAccount, useSignMessage } from "wagmi"

// Loaded client-side only: its wallet/passport chain touches `document` at import
// time, which breaks Next's server-side page-data collection (mirrors Header.tsx).
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

// Linking advances idle → signing (awaiting the wallet signature) → verifying
// (confirming on the server) → done. Drives the stepper + progress bar.
type Phase = "idle" | "signing" | "verifying"

const STEPS = [
  { key: "connect", label: "Connect" },
  { key: "sign", label: "Sign" },
  { key: "linked", label: "Linked" },
] as const

function reasonToMessage(reason: string | undefined): string {
  switch (reason) {
    case "not_found":
      return "This link is invalid. Run /matchbox in Discord to get a new one."
    case "expired":
      return "This link has expired. Run /matchbox in Discord to get a fresh one."
    case "used":
      return "This link has already been used. Run /matchbox in Discord again."
    case "wallet_taken":
      return "This wallet is already linked to a different Discord account."
    case "bad_signature":
      return "Signature verification failed. Please try signing again."
    case "bad_address":
      return "That wallet address looks invalid."
    default:
      return "Something went wrong. Please try again."
  }
}

function truncate(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

function CheckIcon({
  className = "h-3.5 w-3.5",
}: {
  className?: string
}): JSX.Element {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M3.5 8.5l3 3 6-7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

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
      // User rejection or network error.
      const message =
        err instanceof Error && /reject|denied/i.test(err.message)
          ? "Signature request was rejected."
          : "Couldn't complete linking. Please try again."
      setError(message)
      setPhase("idle")
    }
  }, [address, token, signMessageAsync])

  const inFlight = phase !== "idle"
  const linked = result !== null
  // Stepper: Connect (0) → Sign (1) → Linked (2).
  const activeIndex = linked ? 2 : isConnected ? 1 : 0
  const completeUntil = linked ? 3 : activeIndex
  const progressPct = linked
    ? 100
    : phase === "verifying"
      ? 80
      : phase === "signing"
        ? 55
        : isConnected
          ? 33
          : 6

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-8 shadow-xl">
        <h1 className="mb-1 text-center text-2xl font-bold text-[var(--content-primary)]">
          Link your wallet
        </h1>
        <p className="mb-6 text-center text-sm text-[var(--content-secondary)]">
          Connect to Matchbox to track your Mezo Academy points.
        </p>

        {session.status === "loading" && (
          <div className="flex justify-center py-10">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--surface-secondary)] border-t-brand" />
          </div>
        )}

        {session.status === "invalid" && (
          <p className="rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] px-4 py-6 text-center text-sm text-[var(--content-secondary)]">
            {reasonToMessage(session.reason)}
          </p>
        )}

        {session.status === "ready" && (
          <>
            {/* Discord identity */}
            <div className="mb-6 flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-secondary)] px-4 py-3">
              <img
                src={session.avatarUrl}
                alt=""
                className="h-12 w-12 rounded-full"
                width={48}
                height={48}
              />
              <div className="min-w-0">
                <p className="truncate font-semibold text-[var(--content-primary)]">
                  {session.discordGlobalName ??
                    session.discordUsername ??
                    "Discord user"}
                </p>
                {session.discordUsername && (
                  <p className="truncate text-sm text-[var(--content-secondary)]">
                    @{session.discordUsername}
                  </p>
                )}
              </div>
            </div>

            {/* Stepper */}
            <div className="mb-4 flex items-start">
              {STEPS.map((step, i) => {
                const isComplete = i < completeUntil
                const isCurrent = !linked && i === activeIndex
                return (
                  <Fragment key={step.key}>
                    <div className="flex flex-col items-center gap-2">
                      <div
                        className={`flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold transition-colors ${
                          isComplete
                            ? "border-brand bg-brand text-white"
                            : isCurrent
                              ? "border-brand bg-brand/10 text-brand"
                              : "border-[var(--border)] text-[var(--content-tertiary)]"
                        }`}
                      >
                        {isComplete ? (
                          <CheckIcon />
                        ) : isCurrent && inFlight ? (
                          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                        ) : (
                          i + 1
                        )}
                      </div>
                      <span
                        className={`text-xs font-medium ${
                          isComplete || isCurrent
                            ? "text-[var(--content-primary)]"
                            : "text-[var(--content-tertiary)]"
                        }`}
                      >
                        {step.label}
                      </span>
                    </div>
                    {i < STEPS.length - 1 && (
                      <div
                        className={`mx-1 mt-3.5 h-0.5 flex-1 rounded-full transition-colors ${
                          i < completeUntil ? "bg-brand" : "bg-[var(--border)]"
                        }`}
                      />
                    )}
                  </Fragment>
                )
              })}
            </div>

            {/* Progress bar */}
            <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-secondary)]">
              <div
                className="relative h-full overflow-hidden rounded-full bg-brand transition-[width] duration-500 ease-out"
                style={{ width: `${progressPct}%` }}
              >
                {inFlight && <span className="link-progress-sheen" />}
              </div>
            </div>
            {inFlight && (
              <p className="mt-3 text-center text-sm text-[var(--content-secondary)]">
                {phase === "signing"
                  ? "Approve the signature request in your wallet…"
                  : "Confirming ownership and granting your roles…"}
              </p>
            )}

            <div className="mt-6">
              {linked && result ? (
                <div className="text-center">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand/10 text-brand">
                    <CheckIcon className="h-6 w-6" />
                  </div>
                  <p className="mb-1 font-semibold text-[var(--content-primary)]">
                    Wallet linked
                  </p>
                  <p className="mb-4 text-sm text-[var(--content-secondary)]">
                    <code>{truncate(result.wallet)}</code> is now linked to your
                    Discord account.
                  </p>
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-secondary)] px-4 py-4 text-left">
                    {!result.pointsAvailable ? (
                      <p className="text-center text-sm text-[var(--content-secondary)]">
                        We couldn't load your points just now — run{" "}
                        <code>/matchbox</code> in Discord shortly to see them.
                      </p>
                    ) : result.semesters.length === 0 ? (
                      <p className="text-center text-sm text-[var(--content-secondary)]">
                        No semester roles are configured yet.
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {result.semesters.map((s) => (
                          <li
                            key={s.semesterId}
                            className="flex items-center justify-between gap-3"
                          >
                            <span className="whitespace-nowrap text-sm text-[var(--content-primary)]">
                              {s.label}
                            </span>
                            <span className="whitespace-nowrap text-right text-sm text-[var(--content-secondary)]">
                              {s.points.toLocaleString()} pts
                              {s.qualifies ? " · role granted" : ""}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <p className="mt-4 text-sm text-[var(--content-secondary)]">
                    You can close this tab and return to Discord.
                  </p>
                </div>
              ) : (
                <>
                  {!isConnected ? (
                    <button
                      type="button"
                      onClick={() => setDrawerOpen(true)}
                      className="w-full rounded-lg bg-brand px-6 py-3 font-medium text-white transition-opacity hover:opacity-90"
                    >
                      Connect wallet
                    </button>
                  ) : (
                    <>
                      <div className="mb-4 flex items-center justify-between rounded-lg border border-[var(--border)] px-4 py-3">
                        <span className="text-sm text-[var(--content-secondary)]">
                          Connected
                        </span>
                        <code className="text-sm text-[var(--content-primary)]">
                          {address ? truncate(address) : ""}
                        </code>
                      </div>
                      <button
                        type="button"
                        onClick={handleVerify}
                        disabled={inFlight}
                        className="w-full rounded-lg bg-brand px-6 py-3 font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {phase === "signing"
                          ? "Awaiting signature…"
                          : phase === "verifying"
                            ? "Confirming…"
                            : "Verify & link wallet"}
                      </button>
                      {!inFlight && (
                        <button
                          type="button"
                          onClick={() => setDrawerOpen(true)}
                          className="mt-2 w-full text-center text-sm text-[var(--content-secondary)] underline-offset-2 hover:underline"
                        >
                          Use a different wallet
                        </button>
                      )}
                    </>
                  )}

                  {error && (
                    <p className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-center text-sm text-red-500">
                      {error}
                    </p>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>

      <ConnectWalletDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
    </div>
  )
}
