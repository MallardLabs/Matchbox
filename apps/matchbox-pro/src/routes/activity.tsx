import { useWalletDialog } from "@/components/wallet/WalletDialogContext"
import { Link, createFileRoute } from "@tanstack/react-router"
import type { ReactElement } from "react"
import { useAccount } from "wagmi"

export const Route = createFileRoute("/activity")({
  component: ActivityPage,
})

const ctaClass =
  "inline-flex h-9 items-center rounded-md bg-accent px-3.5 text-[13px] font-600 text-on-accent transition-[filter] hover:brightness-95 active:brightness-90"

function ActivityPage(): ReactElement {
  const { isConnected } = useAccount()
  const { openConnect } = useWalletDialog()

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-[28px] font-600 text-ink">Activity</h1>

      <section
        aria-labelledby="activity-empty"
        className="flex flex-col items-start gap-3 rounded-lg bg-inset p-8"
      >
        <h2 id="activity-empty" className="text-[16px] font-600 text-ink">
          {isConnected ? "Not indexed yet" : "No wallet connected"}
        </h2>
        {isConnected ? (
          <Link to="/vote" className={ctaClass}>
            Vote
          </Link>
        ) : (
          <button type="button" onClick={openConnect} className={ctaClass}>
            Connect wallet
          </button>
        )}
      </section>
    </div>
  )
}
