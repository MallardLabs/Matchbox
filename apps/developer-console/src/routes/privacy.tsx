import * as Logo from "@repo/ui/logo"
import { Link, createFileRoute } from "@tanstack/react-router"
import type { ReactElement, ReactNode } from "react"
import { useTitle } from "../lib/title"

/**
 * Public privacy policy (linked from the Google OAuth consent screen). Makes
 * no API calls so it renders even while the console is switched off.
 */
export const Route = createFileRoute("/privacy")({
  component: PrivacyPage,
})

const privacyUpdated = "October 24, 2026"
const privacyContact = "contact@trellium.org"

function Section({
  title,
  children,
}: {
  title: string
  children: ReactNode
}): ReactElement {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-title-sm font-600 text-ink">{title}</h2>
      {children}
    </section>
  )
}

function P({ children }: { children: ReactNode }): ReactElement {
  return <p className="text-body text-secondary">{children}</p>
}

function List({ children }: { children: ReactNode }): ReactElement {
  return (
    <ul className="flex list-disc flex-col gap-2 pl-5 text-body text-secondary marker:text-faint">
      {children}
    </ul>
  )
}

function Mail(): ReactElement {
  return (
    <a
      href={`mailto:${privacyContact}`}
      className="font-500 text-accent-ink hover:underline"
    >
      {privacyContact}
    </a>
  )
}

function PrivacyPage(): ReactElement {
  useTitle("Privacy")
  return (
    <div className="flex min-h-dvh flex-col bg-canvas text-ink">
      <header className="flex h-16 items-center px-5 md:h-[88px] md:px-12">
        <Link
          to="/"
          aria-label="Matchbox Developer home"
          className="flex items-center gap-3"
        >
          <Logo.Root alt="" className="h-[18px] md:h-[25px]" />
          <span className="text-body-sm font-500 text-secondary">
            Developer
          </span>
        </Link>
      </header>
      <main
        id="main-content"
        className="mx-auto flex w-full max-w-2xl flex-col gap-9 px-5 pb-20 pt-6 md:pt-10"
      >
        <header className="flex flex-col gap-2">
          <h1 className="text-title font-600 tracking-[-0.01em]">
            Privacy policy
          </h1>
          <p className="text-body-sm text-muted">Updated {privacyUpdated}</p>
        </header>

        <Section title="Scope">
          <P>
            This policy covers Matchbox Developer: the developer console at
            developer.matchbox.markets and the Matchbox API at
            api.matchbox.markets. Matchbox Developer is operated by Trellium
            ("we", "us").
          </P>
        </Section>

        <Section title="What we collect">
          <List>
            <li>
              Google sign-in: your name, email address, whether Google has
              verified it, your profile picture link, your Google account ID
              and, for Google Workspace accounts, the Workspace domain. We store
              your name (as an editable display name), email, profile picture
              link and Google account ID; the picture is shown to you and to
              members of your organizations. The Workspace domain is used at
              sign-in to grant staff access and is not stored.
            </li>
            <li>
              Account content: organizations, members and invitations, apps and
              their profile details (name, description, logo, website, privacy
              and terms links, support email), environments, redirect URIs,
              allowed origins, scope requests and review notes.
            </li>
            <li>
              Credentials: API keys and client secrets are shown once. We keep
              only a keyed hash and a short prefix, never the full value.
            </li>
            <li>
              Sessions and security: for each session, the browser user agent
              and a truncated IP address (IPv4 /24, IPv6 /48), with its
              creation, last-seen and expiry times. Security-relevant actions
              are written to an append-only audit log with the same truncated IP
              address and a request ID.
            </li>
            <li>
              API usage: for each API request, the request ID, API key ID,
              route, method, status, error code, latency, and the Cloudflare
              data center and country it was served from. Usage data does not
              include full IP addresses or request bodies.
            </li>
            <li>
              Email: addresses you invite, and the messages we send them
              (invitations and review decisions).
            </li>
          </List>
        </Section>

        <Section title="How we use it">
          <P>
            To run the service: sign you in, keep your account and credentials
            secure, enforce rate limits and prevent abuse, show you your usage,
            review access requests, and send service emails. We do not sell
            personal data, use it for advertising, or build marketing profiles.
          </P>
        </Section>

        <Section title="Cookies and local storage">
          <List>
            <li>
              <code className="font-mono text-body-sm">__Host-mbx_dev</code>:
              your session. Expires 12 hours after your last activity and at
              most 7 days after sign-in.
            </li>
            <li>
              <code className="font-mono text-body-sm">
                __Host-mbx_dev_google
              </code>
              : a single-use sign-in check. Expires after 10 minutes.
            </li>
            <li>
              Local storage keeps your theme and selected organization on your
              device.
            </li>
            <li>
              The Sign in with Google button is provided by Google and may set
              Google cookies, governed by Google's privacy policy.
            </li>
          </List>
          <P>We use no analytics or advertising cookies.</P>
        </Section>

        <Section title="Service providers">
          <P>
            Cloudflare (hosting, network, email delivery and usage analytics),
            Supabase (database) and Google (sign-in) process data on our behalf.
            Data may be processed in the United States and other countries where
            they operate.
          </P>
        </Section>

        <Section title="Sharing">
          <P>
            Members of an organization can see each other's names, email
            addresses and profile pictures, and the organization's apps,
            settings and usage. Matchbox staff can see account, app and review
            details to operate the service. Otherwise we share data only with
            the providers above or when required by law.
          </P>
        </Section>

        <Section title="Retention">
          <List>
            <li>Account data: while your account exists.</li>
            <li>
              Sessions: they expire as described above; their records are kept
              for security review.
            </li>
            <li>
              Audit log: kept for security and accountability; it cannot be
              edited.
            </li>
            <li>API usage data: about three months.</li>
          </List>
          <P>
            When you ask us to delete your account, we delete or anonymize your
            data, except records we must keep for security or legal reasons.
          </P>
        </Section>

        <Section title="Your choices">
          <P>
            You can change your display name in the console. To access, correct,
            export or delete your data, email <Mail />. You can also remove
            Matchbox Developer's access in your Google Account settings.
          </P>
        </Section>

        <Section title="Security">
          <P>
            Traffic is encrypted in transit. Credentials are stored only as
            keyed hashes, database access is limited to our servers, and
            sensitive actions require a fresh Google confirmation.
          </P>
        </Section>

        <Section title="Children">
          <P>Matchbox Developer is not directed to anyone under 16.</P>
        </Section>

        <Section title="Changes">
          <P>
            We will update the date above when this policy changes and tell
            account holders about material changes by email or in the console.
          </P>
        </Section>

        <Section title="Contact">
          <P>
            Trellium · <Mail />
          </P>
        </Section>
      </main>
    </div>
  )
}
