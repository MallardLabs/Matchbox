import dynamic from "next/dynamic"
import { useRouter } from "next/router"
import { useCallback, useEffect, useState } from "react"
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

export default function LinkWalletPage(): JSX.Element {
  const router = useRouter()
  const token = typeof router.query.token === "string" ? router.query.token : ""

  const { address, isConnected } = useAccount()
  const { signMessageAsync } = useSignMessage()

  const [session, setSession] = useState<Session>({ status: "loading" })
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [verifying, setVerifying] = useState(false)
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
    setVerifying(true)
    try {
      const msgRes = await fetch(
        `${FUNCTIONS_URL}?action=message&token=${encodeURIComponent(token)}&address=${address}`,
        { headers: functionHeaders() },
      )
      const msgData = await msgRes.json()
      if (!msgData.success) {
        setError(reasonToMessage(msgData.reason))
        return
      }

      const signature = await signMessageAsync({ message: msgData.message })

      const verifyRes = await fetch(`${FUNCTIONS_URL}?action=verify`, {
        method: "POST",
        headers: { ...functionHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ token, address, signature }),
      })
      const verifyData = await verifyRes.json()
      if (!verifyData.success) {
        setError(reasonToMessage(verifyData.reason))
        return
      }
      setResult({
        wallet: verifyData.wallet,
        semesters: verifyData.semesters ?? [],
        pointsAvailable: verifyData.pointsAvailable,
      })
    } catch (err) {
      // User rejection or network error.
      const message =
        err instanceof Error && /reject|denied/i.test(err.message)
          ? "Signature request was rejected."
          : "Couldn't complete linking. Please try again."
      setError(message)
    } finally {
      setVerifying(false)
    }
  }, [address, token, signMessageAsync])

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
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-transparent border-t-[var(--accent)]" />
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

            {result ? (
              <div className="text-center">
                <div className="mb-3 text-4xl">🎉</div>
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
                    className="w-full rounded-lg bg-[var(--accent)] px-6 py-3 font-medium text-white transition-opacity hover:opacity-90"
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
                      disabled={verifying}
                      className="w-full rounded-lg bg-[var(--accent)] px-6 py-3 font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {verifying
                        ? "Waiting for signature…"
                        : "Verify & link wallet"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDrawerOpen(true)}
                      className="mt-2 w-full text-center text-sm text-[var(--content-secondary)] underline-offset-2 hover:underline"
                    >
                      Use a different wallet
                    </button>
                  </>
                )}

                {error && (
                  <p className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-center text-sm text-red-500">
                    {error}
                  </p>
                )}
              </>
            )}
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
