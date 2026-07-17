import Link from "next/link"
import { useRouter } from "next/router"
import IncentivesPage from "./IncentivesPage"
import ValidatorVotingPage from "./ValidatorVotingPage"

export default function VeBTCHubPage(): JSX.Element {
  const router = useRouter()
  const view = router.query.view === "manage" ? "manage" : "vote"

  return (
    <div className="flex flex-col gap-6">
      <nav
        aria-label="veBTC tools"
        className="inline-flex self-start rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1"
      >
        <Link
          href="/incentives?view=vote"
          aria-current={view === "vote" ? "page" : undefined}
          className={`rounded-md px-4 py-2 text-sm font-medium no-underline ${
            view === "vote"
              ? "bg-[#F7931A] text-black"
              : "text-[var(--content-secondary)] hover:text-[var(--content-primary)]"
          }`}
        >
          Validator Voting
        </Link>
        <Link
          href="/incentives?view=manage"
          aria-current={view === "manage" ? "page" : undefined}
          className={`rounded-md px-4 py-2 text-sm font-medium no-underline ${
            view === "manage"
              ? "bg-[#F7931A] text-black"
              : "text-[var(--content-secondary)] hover:text-[var(--content-primary)]"
          }`}
        >
          Manage veBTC
        </Link>
      </nav>
      {view === "vote" ? <ValidatorVotingPage /> : <IncentivesPage />}
    </div>
  )
}
