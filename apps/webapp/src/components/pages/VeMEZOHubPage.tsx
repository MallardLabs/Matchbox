import Link from "next/link"
import { useRouter } from "next/router"
import BoostPage from "./BoostPage"
import MezoGaugesVotingPage from "./MezoGaugesVotingPage"

export default function VeMEZOHubPage(): JSX.Element {
  const router = useRouter()
  const view = router.query.view === "mezo-gauges" ? "mezo-gauges" : "boost"

  return (
    <div className="flex flex-col gap-6">
      <nav
        aria-label="veMEZO tools"
        className="inline-flex self-start rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1"
      >
        <Link
          href="/boost?view=boost"
          aria-current={view === "boost" ? "page" : undefined}
          className={`rounded-md px-4 py-2 text-sm font-medium no-underline ${
            view === "boost"
              ? "bg-[#F7931A] text-black"
              : "text-[var(--content-secondary)] hover:text-[var(--content-primary)]"
          }`}
        >
          Boost Gauges
        </Link>
        <Link
          href="/boost?view=mezo-gauges"
          aria-current={view === "mezo-gauges" ? "page" : undefined}
          className={`rounded-md px-4 py-2 text-sm font-medium no-underline ${
            view === "mezo-gauges"
              ? "bg-[#F7931A] text-black"
              : "text-[var(--content-secondary)] hover:text-[var(--content-primary)]"
          }`}
        >
          MEZO Gauges
        </Link>
      </nav>
      {view === "mezo-gauges" ? <MezoGaugesVotingPage /> : <BoostPage />}
    </div>
  )
}
