import Link from "next/link"
import { useRouter } from "next/router"
import IncentivesPage from "./IncentivesPage"
import PoolVotingPage from "./PoolVotingPage"
import ValidatorVotingPage from "./ValidatorVotingPage"

type VeBTCHubView = "vote" | "pools" | "manage"

const VIEWS: readonly { id: VeBTCHubView; label: string }[] = [
  { id: "vote", label: "Validator Voting" },
  { id: "pools", label: "Pool Voting" },
  { id: "manage", label: "Manage veBTC" },
]

function parseView(value: string | string[] | undefined): VeBTCHubView {
  return value === "pools" || value === "manage" ? value : "vote"
}

export default function VeBTCHubPage(): JSX.Element {
  const router = useRouter()
  const view = parseView(router.query.view)

  return (
    <div className="flex flex-col gap-6">
      <nav
        aria-label="veBTC tools"
        className="inline-flex self-start rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1"
      >
        {VIEWS.map((option) => (
          <Link
            key={option.id}
            href={`/incentives?view=${option.id}`}
            aria-current={view === option.id ? "page" : undefined}
            className={`rounded-md px-4 py-2 text-sm font-medium no-underline ${
              view === option.id
                ? "bg-[#F7931A] text-black"
                : "text-[var(--content-secondary)] hover:text-[var(--content-primary)]"
            }`}
          >
            {option.label}
          </Link>
        ))}
      </nav>
      {view === "vote" ? (
        <ValidatorVotingPage />
      ) : view === "pools" ? (
        <PoolVotingPage />
      ) : (
        <IncentivesPage />
      )}
    </div>
  )
}
