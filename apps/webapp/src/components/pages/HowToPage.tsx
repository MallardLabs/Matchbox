import { SpringIn } from "@/components/SpringIn"
import NextLink from "next/link"

interface ConceptCardProps {
  title: string
  description: string
  accentColor: string
}

function ConceptCard({ title, description, accentColor }: ConceptCardProps) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex items-center gap-2">
        <span
          className="h-2 w-2 flex-shrink-0 rounded-full"
          style={{ backgroundColor: accentColor }}
          aria-hidden="true"
        />
        <span
          className="font-mono text-xs font-semibold text-[var(--content-primary)]"
          style={{ color: accentColor }}
        >
          {title}
        </span>
      </div>
      <p className="text-xs leading-relaxed text-[var(--content-secondary)]">
        {description}
      </p>
    </div>
  )
}

interface StepProps {
  number: number
  title: string
  description: string
}

function Step({ number, title, description }: StepProps) {
  return (
    <div className="flex gap-4">
      <div className="flex-shrink-0">
        <span
          className="flex h-7 w-7 items-center justify-center rounded-full border border-[#F7931A] font-mono text-xs font-semibold text-[#F7931A]"
          aria-hidden="true"
        >
          {number}
        </span>
      </div>
      <div className="pt-0.5">
        <p className="mb-1 text-sm font-semibold text-[var(--content-primary)]">
          {title}
        </p>
        <p className="text-sm leading-relaxed text-[var(--content-secondary)]">
          {description}
        </p>
      </div>
    </div>
  )
}

interface SectionHeaderProps {
  command: string
  badge: string
  badgeColor: string
  description: string
}

function SectionHeader({
  command,
  badge,
  badgeColor,
  description,
}: SectionHeaderProps) {
  return (
    <div className="mb-6">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 font-mono text-xl font-semibold text-[var(--content-primary)]">
          <span style={{ color: "#F7931A" }} aria-hidden="true">
            $
          </span>
          <span>{command}</span>
          <span
            className="ml-0.5 inline-block h-4 w-2 animate-cursor-blink"
            style={{ backgroundColor: "#F7931A" }}
            aria-hidden="true"
          />
        </div>
        <span
          className="rounded-full border px-2.5 py-0.5 font-mono text-xs font-semibold"
          style={{
            borderColor: `${badgeColor}50`,
            backgroundColor: `${badgeColor}15`,
            color: badgeColor,
          }}
        >
          {badge}
        </span>
      </div>
      <p className="text-sm leading-relaxed text-[var(--content-secondary)]">
        {description}
      </p>
    </div>
  )
}

interface FAQItemProps {
  question: string
  answer: string
}

function FAQItem({ question, answer }: FAQItemProps) {
  return (
    <details className="group border-b border-[var(--border)] py-4 last:border-0">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-[var(--content-primary)] hover:text-[#F7931A]">
        <span>{question}</span>
        <span
          className="flex-shrink-0 font-mono text-[#F7931A] transition-transform group-open:rotate-45"
          aria-hidden="true"
        >
          +
        </span>
      </summary>
      <p className="mt-3 text-sm leading-relaxed text-[var(--content-secondary)]">
        {answer}
      </p>
    </details>
  )
}

function ExternalLink({ href, children }: { href: string; children: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 font-mono text-sm text-[#F7931A] no-underline hover:underline"
    >
      {children}
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
        <polyline points="15 3 21 3 21 9" />
        <line x1="10" y1="14" x2="21" y2="3" />
      </svg>
    </a>
  )
}

const veMEZOSteps: StepProps[] = [
  {
    number: 1,
    title: "Acquire veMEZO",
    description:
      "Lock MEZO tokens at mezo.org/earn. Each lock creates a veMEZO NFT. Longer lock durations grant more voting power. Locks are non-transferable and decay linearly toward their unlock date (permanent locks never decay).",
  },
  {
    number: 2,
    title: "Select your locks",
    description:
      'On the veMEZO page, the carousel at the top shows all your veMEZO lock NFTs. Click a card to select it — you can pick multiple locks at once. Locks marked "Next Epoch" have already voted this epoch and will be available again after Thursday.',
  },
  {
    number: 3,
    title: "Evaluate gauges",
    description:
      'The gauge table is sorted by APY by default. APY is calculated from total epoch incentives deposited divided by total veMEZO weight voting for the gauge, annualized (×52). Check "Optimal veMEZO" for how much veMEZO vote weight the gauge needs for max boost (5x)—using veBTC unboostedTotalVotingPower() and veMEZO totalVotingPower() from escrow, same as the Boost calculator.',
  },
  {
    number: 4,
    title: "Allocate votes",
    description:
      "Enter a Vote % for each gauge you want to support. Your total allocation across all selected gauges must be ≤ 100%. You can concentrate on one gauge or spread across many — your bribe earnings are proportional to your allocation.",
  },
  {
    number: 5,
    title: "Submit your vote",
    description:
      "Click Vote in the cart. If your wallet supports atomic batching, Matchbox will request one confirmation for all selected veMEZO locks. Otherwise it falls back to one transaction per lock and tracks each step in the cart modal.",
  },
  {
    number: 6,
    title: "Claim rewards",
    description:
      'After Thursday 00:00 UTC, visit the Dashboard. Your claimable bribe rewards appear grouped by gauge and token. Click "Claim All" to collect through one wallet batch when supported, or the existing per-lock flow when it is not. Rewards do not expire — claim when convenient.',
  },
]

const veBTCSteps: StepProps[] = [
  {
    number: 1,
    title: "Acquire veBTC",
    description:
      "Lock BTC at mezo.org/earn to receive a veBTC NFT. Each veBTC lock can own exactly one gauge on Matchbox.",
  },
  {
    number: 2,
    title: "Create your gauge",
    description:
      'On the veBTC page, select your veBTC lock and click "Create Gauge". This deploys an on-chain gauge contract linked to your veBTC lock — this is a one-time action per lock.',
  },
  {
    number: 3,
    title: "Set up your profile",
    description:
      "Fill in your gauge's display name, description, profile picture, and social links. Profiles with complete information attract significantly more voters than unconfigured gauges. Your strategy statement helps voters understand your goals.",
  },
  {
    number: 4,
    title: "Add incentives (bribes)",
    description:
      "Deposit whitelisted tokens (BTC, MEZO, mUSD, and others) into your gauge's bribe pool. veMEZO voters who direct weight to your gauge earn proportional shares of the bribe pool at epoch end. Higher incentives attract more votes.",
  },
  {
    number: 5,
    title: "Track your boost",
    description:
      "The Boost Multiplier on your Dashboard card ranges from 1x to 5x. It increases as more veMEZO weight is directed to your gauge relative to your veBTC weight. At 5x, your BTC yield is maximized.",
  },
  {
    number: 6,
    title: "Manage across epochs",
    description:
      "Add more incentives before each epoch begins for full visibility to voters. The APY displayed on your gauge is exactly what voters see — keeping APY competitive relative to other gauges drives more votes and pushes your boost multiplier higher.",
  },
]

const faqItems: FAQItemProps[] = [
  {
    question: "When do epochs start and end?",
    answer:
      "Epochs are 7-day periods that reset every Thursday at 00:00 UTC. Votes placed before the boundary count toward that epoch. Bribe rewards become claimable after the epoch ends.",
  },
  {
    question: "Can I change my vote during an epoch?",
    answer:
      "Yes. Click Reset in the voting cart to clear your current allocations, then re-vote. You can do this once per lock per epoch — after resetting, you can vote again once more.",
  },
  {
    question: "What determines the APY shown on a gauge?",
    answer:
      "APY = (total USD value of incentives in the bribe pool ÷ total veMEZO weight voting for the gauge) × 52 weeks. More incentives or fewer voters means higher APY. APY can change throughout an epoch as more votes come in.",
  },
  {
    question: 'What is the "Optimal veMEZO" field?',
    answer:
      "This is the total veMEZO voting weight that needs to be on a gauge for maximum boost (5x). The target uses veBTC unboostedTotalVotingPower() and veMEZO totalVotingPower() from escrow—the same system totals as the Boost page calculator. If the gauge is below target, Matchbox also shows how much veMEZO weight is still needed to reach 5x.",
  },
  {
    question: "Can I vote for multiple gauges?",
    answer:
      "Yes. Split your allocation across any number of active gauges as long as your total percentages are ≤ 100%. Your bribe earnings from each gauge are proportional to your allocated percentage.",
  },
  {
    question: "What happens if I don't claim my bribes?",
    answer:
      "Unclaimed rewards accumulate and remain claimable indefinitely — they do not expire. However, you must have voted in an epoch to earn bribe rewards for that epoch.",
  },
]

export default function HowToPage() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-12 px-4 py-8 md:py-12">
      {/* Page Header */}
      <SpringIn delay={0} variant="card">
        <header>
          <div className="mb-3 flex items-center gap-1 font-mono text-2xl font-semibold text-[var(--content-primary)] md:text-3xl">
            <span style={{ color: "#F7931A" }} aria-hidden="true">
              $
            </span>
            <span>how2 matchbox</span>
            <span
              className="ml-1 inline-block h-6 w-2.5 animate-cursor-blink"
              style={{ backgroundColor: "#F7931A" }}
              aria-hidden="true"
            />
          </div>
          <p className="max-w-xl text-sm leading-relaxed text-[var(--content-secondary)] md:text-base">
            A complete guide to the veBTC + veMEZO matching protocol. Learn how
            to earn bribes as a veMEZO voter, or attract votes as a veBTC gauge
            holder.
          </p>
        </header>
      </SpringIn>

      {/* Key Concepts */}
      <SpringIn delay={1} variant="card">
        <section aria-labelledby="concepts-heading">
          <div className="mb-5 flex items-center gap-2">
            <span
              className="h-px flex-1 bg-[var(--border)]"
              aria-hidden="true"
            />
            <h2
              id="concepts-heading"
              className="font-mono text-xs uppercase tracking-widest text-[var(--content-tertiary)]"
            >
              Key Concepts
            </h2>
            <span
              className="h-px flex-1 bg-[var(--border)]"
              aria-hidden="true"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <ConceptCard
              title="What is a Gauge?"
              accentColor="#F7931A"
              description="An on-chain voting target owned by a veBTC holder. veMEZO voters allocate weight to gauges to boost them and earn bribes deposited by the gauge owner."
            />
            <ConceptCard
              title="What is Voting Power?"
              accentColor="#22C55E"
              description="Your veMEZO balance converted to weighted influence. Larger locks and longer durations give more power. Power decays linearly toward the unlock date."
            />
            <ConceptCard
              title="What is an Epoch?"
              accentColor="#06B6D4"
              description="A 7-day cycle resetting every Thursday at 00:00 UTC. Votes and bribes settle at epoch boundaries. Bribe rewards become claimable after the epoch ends."
            />
            <ConceptCard
              title="What is Boost Multiplier?"
              accentColor="#A855F7"
              description="A gauge's yield amplifier ranging 1x–5x. Increases as veMEZO weight votes for the gauge relative to its veBTC weight. Higher boost = higher APY for the veBTC holder."
            />
          </div>
        </section>
      </SpringIn>

      {/* veMEZO Section */}
      <SpringIn delay={2} variant="card">
        <section
          aria-labelledby="vemezo-heading"
          className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 md:p-8"
        >
          <SectionHeader
            command="boost --help"
            badge="For veMEZO Holders"
            badgeColor="#EF4444"
            description="Vote on veBTC gauges with your locked MEZO. Earn bribe rewards (incentives) proportional to your voting weight each epoch."
          />

          {/* Quick Start */}
          <div className="mb-8">
            <h3 className="mb-3 font-mono text-xs uppercase tracking-widest text-[var(--content-tertiary)]">
              Quick Start
            </h3>
            <ol className="flex flex-col gap-1.5">
              {[
                "Lock MEZO on Mezo Earn to receive a veMEZO NFT",
                "Navigate to the veMEZO page (/boost)",
                "Select your veMEZO lock(s) in the carousel",
                "Browse gauges — sort by APY to find the best returns",
                "Enter vote % allocations across gauges (total ≤ 100%)",
                "Click Vote and sign the transaction(s)",
                "After the epoch ends, go to Dashboard and claim bribe rewards",
              ].map((item, i) => (
                <li
                  key={item}
                  className="flex items-start gap-2 text-sm text-[var(--content-secondary)]"
                >
                  <span
                    className="mt-0.5 flex-shrink-0 font-mono text-xs font-semibold text-[#EF4444]"
                    aria-hidden="true"
                  >
                    {i + 1}.
                  </span>
                  {item}
                </li>
              ))}
            </ol>
          </div>

          {/* Step by step */}
          <div className="mb-8">
            <h3 className="mb-4 font-mono text-xs uppercase tracking-widest text-[var(--content-tertiary)]">
              Step by Step
            </h3>
            <div className="flex flex-col gap-6">
              {veMEZOSteps.map((step) => (
                <Step key={step.number} {...step} />
              ))}
            </div>
          </div>

          {/* Read more */}
          <div className="flex items-center gap-2 border-t border-[var(--border)] pt-4">
            <span className="font-mono text-xs text-[var(--content-tertiary)]">
              $
            </span>
            <span className="text-sm text-[var(--content-secondary)]">
              Full guide:
            </span>
            <ExternalLink href="https://matchbox.markets/docs/guides/voting">
              docs/guides/voting
            </ExternalLink>
          </div>
        </section>
      </SpringIn>

      {/* veBTC Section */}
      <SpringIn delay={3} variant="card">
        <section
          aria-labelledby="vebtc-heading"
          className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 md:p-8"
        >
          <SectionHeader
            command="gauge --help"
            badge="For veBTC Holders"
            badgeColor="#F7931A"
            description="Manage your gauge profile and deposit incentives to attract veMEZO votes. More votes increase your boost multiplier and amplify your BTC yield."
          />

          {/* Quick Start */}
          <div className="mb-8">
            <h3 className="mb-3 font-mono text-xs uppercase tracking-widest text-[var(--content-tertiary)]">
              Quick Start
            </h3>
            <ol className="flex flex-col gap-1.5">
              {[
                "Lock BTC on Mezo Earn to receive a veBTC NFT",
                "Navigate to the veBTC page (/incentives)",
                "Select your veBTC lock in the carousel",
                "Create a gauge for your lock (one-time, on-chain)",
                "Set up your gauge profile — name, description, image, socials",
                "Deposit incentive tokens (bribes) to attract veMEZO voters",
                "Monitor your Boost Multiplier and APY on Dashboard",
              ].map((item, i) => (
                <li
                  key={item}
                  className="flex items-start gap-2 text-sm text-[var(--content-secondary)]"
                >
                  <span
                    className="mt-0.5 flex-shrink-0 font-mono text-xs font-semibold text-[#F7931A]"
                    aria-hidden="true"
                  >
                    {i + 1}.
                  </span>
                  {item}
                </li>
              ))}
            </ol>
          </div>

          {/* Step by step */}
          <div className="mb-8">
            <h3 className="mb-4 font-mono text-xs uppercase tracking-widest text-[var(--content-tertiary)]">
              Step by Step
            </h3>
            <div className="flex flex-col gap-6">
              {veBTCSteps.map((step) => (
                <Step key={step.number} {...step} />
              ))}
            </div>
          </div>

          {/* Read more */}
          <div className="flex items-center gap-2 border-t border-[var(--border)] pt-4">
            <span className="font-mono text-xs text-[var(--content-tertiary)]">
              $
            </span>
            <span className="text-sm text-[var(--content-secondary)]">
              Full guide:
            </span>
            <ExternalLink href="https://matchbox.markets/docs/guides/managing-gauges">
              docs/guides/managing-gauges
            </ExternalLink>
          </div>
        </section>
      </SpringIn>

      {/* FAQ Section */}
      <SpringIn delay={4} variant="card">
        <section
          aria-labelledby="faq-heading"
          className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 md:p-8"
        >
          <div className="mb-6">
            <div className="flex items-center gap-1 font-mono text-xl font-semibold text-[var(--content-primary)]">
              <span style={{ color: "#F7931A" }} aria-hidden="true">
                $
              </span>
              <span>how2 matchbox --faq</span>
              <span
                className="ml-0.5 inline-block h-4 w-2 animate-cursor-blink"
                style={{ backgroundColor: "#F7931A" }}
                aria-hidden="true"
              />
            </div>
          </div>
          <div>
            {faqItems.map((item) => (
              <FAQItem key={item.question} {...item} />
            ))}
          </div>
        </section>
      </SpringIn>

      {/* Footer CTA */}
      <SpringIn delay={5} variant="card">
        <footer className="flex flex-col items-center gap-4 border-t border-[var(--border)] pt-8 text-center">
          <p className="font-mono text-sm text-[var(--content-secondary)]">
            <span className="text-[#F7931A]" aria-hidden="true">
              $
            </span>{" "}
            ready to get started?
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <NextLink
              href="/boost"
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2 font-mono text-sm text-[var(--content-secondary)] no-underline transition-colors hover:border-[#EF4444] hover:text-[#EF4444]"
            >
              veMEZO → Vote to Boost
            </NextLink>
            <NextLink
              href="/incentives"
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2 font-mono text-sm text-[var(--content-secondary)] no-underline transition-colors hover:border-[#F7931A] hover:text-[#F7931A]"
            >
              veBTC → Manage Gauge
            </NextLink>
          </div>
        </footer>
      </SpringIn>
    </div>
  )
}
