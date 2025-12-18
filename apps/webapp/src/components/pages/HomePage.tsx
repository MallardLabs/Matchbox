import { Layout } from "@/components/Layout"
import { SpringIn } from "@/components/SpringIn"
import { useTheme } from "@/contexts/ThemeContext"
import { Button } from "@mezo-org/mezo-clay"
import Link from "next/link"
import { useAccount } from "wagmi"

function ArrowRightIcon(): JSX.Element {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  )
}

function TerminalIcon(): JSX.Element {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  )
}

interface ActionCardProps {
  title: string
  command: string
  description: string
  buttonText: string
  href: string
  variant?: "primary" | "secondary"
  accentColor?: string
}

function ActionCard({
  title,
  command,
  description,
  buttonText,
  href,
  variant = "primary",
  accentColor = "#F7931A",
}: ActionCardProps): JSX.Element {
  return (
    <article className="group relative flex h-full flex-col rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 transition-all duration-200 hover:shadow-terminal-md md:p-6">
      {/* Hover border overlay with accent color */}
      <div
        className="pointer-events-none absolute inset-0 rounded-xl border-2 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
        style={{ borderColor: accentColor }}
        aria-hidden="true"
      />
      {/* Terminal-style header */}
      <header className="mb-4">
        <div className="mb-2 flex items-center gap-2">
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: accentColor }}
            aria-hidden="true"
          />
          <span className="text-2xs uppercase tracking-wider text-[var(--content-tertiary)]">
            {title}
          </span>
        </div>
        <div className="flex items-center gap-1 font-mono text-lg text-[var(--content-primary)]">
          <span style={{ color: accentColor }} aria-hidden="true">
            $
          </span>
          <span>{command}</span>
          <span
            className="ml-0.5 inline-block h-4 w-2 animate-cursor-blink"
            style={{ backgroundColor: accentColor }}
            aria-hidden="true"
          />
        </div>
      </header>

      {/* Description */}
      <p className="mb-6 flex-1 text-sm leading-relaxed text-[var(--content-secondary)]">
        {description}
      </p>

      {/* Action button */}
      <Link href={href} passHref legacyBehavior>
        <Button kind={variant} $as="a">
          <span className="flex items-center gap-2">
            {buttonText}
            <ArrowRightIcon />
          </span>
        </Button>
      </Link>
    </article>
  )
}

export default function HomePage(): JSX.Element {
  const { isConnected } = useAccount()
  const { theme: currentTheme } = useTheme()

  return (
    <Layout>
      <div className="flex flex-col items-center gap-8 px-4 pt-6 md:gap-12 md:pt-12">
        {/* Hero Section */}
        <SpringIn delay={0} variant="card">
          <section className="max-w-2xl text-center">
            <div className="mb-6 flex justify-center">
              <img
                src="/matchbox.png"
                alt="Matchbox"
                width={160}
                height={64}
                className="h-16 w-auto md:h-20"
                style={{
                  imageRendering: "crisp-edges",
                  filter: currentTheme === "dark" ? "invert(1)" : "none",
                }}
              />
            </div>

            {/* Terminal-style tagline */}
            <div className="mb-4 inline-flex items-center gap-2 rounded-lg bg-[var(--surface-secondary)] px-4 py-2">
              <TerminalIcon />
              <span className="font-mono text-sm text-[var(--content-secondary)]">
                veBTC + veMEZO matching protocol
              </span>
            </div>

            <p className="mx-auto max-w-lg text-base leading-relaxed text-[var(--content-secondary)] md:text-lg">
              Earn bribes with your veMEZO, or pay to get boosted--
            </p>
          </section>
        </SpringIn>

        {/* Action Cards Grid */}
        <div className="grid w-full max-w-4xl gap-4 md:grid-cols-3 md:gap-5">
          <SpringIn delay={1} variant="card">
            <ActionCard
              title="veMEZO Holders"
              command="vote --boost"
              description="Vote on veBTC gauges to boost their voting power and earn incentives in return."
              buttonText="Vote to Boost"
              href="/boost"
              accentColor="#EF4444"
            />
          </SpringIn>

          <SpringIn delay={2} variant="card">
            <ActionCard
              title="veBTC Holders"
              command="gauge --manage"
              description="Manage your gauge profile, add incentives, and set your strategy to attract veMEZO votes."
              buttonText="Manage Gauge"
              href="/incentives"
              accentColor="#F7931A"
            />
          </SpringIn>

          <SpringIn delay={3} variant="card">
            <ActionCard
              title="Analytics"
              command="status --all"
              description="Monitor your boosts, fees earned, and gauge performance over time."
              buttonText="View Dashboard"
              href="/dashboard"
              variant="secondary"
              accentColor="#22C55E"
            />
          </SpringIn>
        </div>

        {/* Connect Prompt */}
        {!isConnected && (
          <SpringIn delay={4} variant="card">
            <div className="flex items-center gap-3 rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface-secondary)] px-6 py-4">
              <div
                className="h-2 w-2 animate-pulse rounded-full bg-[#F7931A]"
                aria-hidden="true"
              />
              <p className="font-mono text-sm text-[var(--content-secondary)]">
                <span className="text-[#F7931A]" aria-hidden="true">
                  $
                </span>{" "}
                connect --wallet to get started
              </p>
            </div>
          </SpringIn>
        )}

        {/* Stats Section (optional future enhancement) */}
        <SpringIn delay={5} variant="card">
          <footer className="mb-8 w-full max-w-4xl border-t border-[var(--border)] pt-8">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-6">
              <StatCard label="Protocol" value="Matchbox" />
              <StatCard label="Network" value="Mezo" />
              <StatCard label="Status" value="Active" isActive />
              <StatCard label="Version" value="v1.0" />
            </div>
          </footer>
        </SpringIn>
      </div>
    </Layout>
  )
}

interface StatCardProps {
  label: string
  value: string
  isActive?: boolean
}

function StatCard({ label, value, isActive }: StatCardProps): JSX.Element {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
      <p className="mb-1 text-2xs uppercase tracking-wider text-[var(--content-tertiary)]">
        {label}
      </p>
      <p className="flex items-center gap-2 font-mono text-sm text-[var(--content-primary)]">
        {isActive && (
          <span
            className="h-2 w-2 rounded-full bg-[#22C55E] shadow-[0_0_8px_rgba(34,197,94,0.5)]"
            aria-hidden="true"
          />
        )}
        {value}
      </p>
    </div>
  )
}
