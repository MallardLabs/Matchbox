import type { ReactNode } from "react"

/**
 * The Matchbox privacy policy (all products). Product sections have stable
 * anchors (#matchbox-app, #discord, #matchbox-pro, #matchbox-developer,
 * #matchbox-id) that the other apps link to.
 */

const updated = "October 24, 2026"
const contact = "contact@trellium.org"

const products = [
  { id: "matchbox-app", label: "Matchbox app" },
  { id: "discord", label: "Matchbox Discord bot" },
  { id: "matchbox-pro", label: "Matchbox Pro" },
  {
    id: "matchbox-developer",
    label: "Matchbox Developer and the Matchbox API",
  },
  { id: "matchbox-id", label: "Matchbox ID" },
] as const

function Section({
  id,
  title,
  children,
}: {
  id?: string
  title: string
  children: ReactNode
}): JSX.Element {
  return (
    <section id={id} className="flex scroll-mt-24 flex-col gap-3">
      <h2 className="text-lg font-semibold text-[var(--content-primary)]">
        {title}
      </h2>
      {children}
    </section>
  )
}

function Sub({
  title,
  children,
}: {
  title: string
  children: ReactNode
}): JSX.Element {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold text-[var(--content-primary)]">
        {title}
      </h3>
      {children}
    </div>
  )
}

function P({ children }: { children: ReactNode }): JSX.Element {
  return (
    <p className="text-sm leading-relaxed text-[var(--content-secondary)]">
      {children}
    </p>
  )
}

function List({ children }: { children: ReactNode }): JSX.Element {
  return (
    <ul className="flex list-disc flex-col gap-2 pl-5 text-sm leading-relaxed text-[var(--content-secondary)]">
      {children}
    </ul>
  )
}

function Code({ children }: { children: ReactNode }): JSX.Element {
  return (
    <code className="font-mono text-xs text-[var(--content-primary)]">
      {children}
    </code>
  )
}

function Mail(): JSX.Element {
  return (
    <a
      href={`mailto:${contact}`}
      className="font-medium text-[var(--content-primary)] underline underline-offset-2"
    >
      {contact}
    </a>
  )
}

export default function PrivacyPage(): JSX.Element {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-4 pb-20 pt-8 md:px-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--content-primary)]">
          Privacy policy
        </h1>
        <p className="text-sm text-[var(--content-secondary)]">
          Updated {updated}
        </p>
      </header>

      <Section title="Who we are and what this covers">
        <P>
          Matchbox is operated by Trellium ("we", "us"). This policy covers the
          Matchbox app (matchbox.markets and app.matchbox.markets), the Matchbox
          Discord bot, Matchbox Pro (pro.matchbox.markets), Matchbox Developer
          and the Matchbox API (developer.matchbox.markets and
          api.matchbox.markets), and Matchbox ID (id.matchbox.markets).
        </P>
        <nav aria-label="Products" className="flex flex-col gap-1">
          {products.map((product) => (
            <a
              key={product.id}
              href={`#${product.id}`}
              className="text-sm text-[var(--content-primary)] underline underline-offset-2"
            >
              {product.label}
            </a>
          ))}
        </nav>
      </Section>

      <Section title="Public blockchain data">
        <P>
          Matchbox reads public data from Mezo and other blockchains. Wallet
          addresses, balances, locks, votes and transactions are public on those
          networks. We do not control that data and cannot change or delete it.
        </P>
      </Section>

      <Section title="Across all products">
        <List>
          <li>
            Wallets: the Matchbox app and Matchbox Pro have no accounts. We
            identify you by the wallet you connect. We never receive your
            private keys. When we ask you to sign a message, it only proves that
            you control a wallet.
          </li>
          <li>
            Wallet connections go through WalletConnect (Reown) and the wallet
            app you choose (for example MetaMask or Coinbase Wallet), under
            their own privacy policies.
          </li>
          <li>
            To show your on-chain data, your browser and our servers send
            requests about your wallet to blockchain node (RPC) providers: Mezo
            RPC operators (Mezo, Boar, Validation Cloud, dRPC) and Cloudflare's
            Ethereum gateway.
          </li>
          <li>
            Our services run on Cloudflare, which processes IP addresses and
            request data to deliver and protect them. Our operational logs can
            include wallet addresses or Discord user IDs when something fails.
          </li>
          <li>
            We do not sell personal data, use it for advertising or build
            marketing profiles.
          </li>
        </List>
      </Section>

      <Section id="matchbox-app" title="Matchbox app">
        <Sub title="Profiles">
          <P>
            When you edit a gauge or validator profile, you sign a message with
            the owning wallet. We store the profile (name, description, website,
            social links, tags, strategies and picture) with the owner's and
            editor's wallet addresses. Profiles are public: they appear in
            Matchbox and Matchbox Pro and through the Matchbox API. Profile
            pictures are stored in public file storage. If you appoint other
            editors, we store their addresses and a hash of your approval
            message. Saved profile templates are stored with your wallet address
            and are not private.
          </P>
        </Sub>
        <Sub title="Activity and lookups">
          <P>
            When you view the transactions of an address, we look it up in our
            activity database (hosted by Neon) or, as a fallback, in indexes
            hosted by Goldsky, including Mezo's. When you use ID lookup, what
            you type is sent to Mezo's API (api.mezo.org).
          </P>
        </Sub>
        <Sub title="Analytics and fonts">
          <P>
            We count page views with Umami Cloud (page, referrer, browser,
            device type and country). Umami does not use cookies. The app loads
            fonts from Google Fonts, so Google receives your IP address and
            browser details when a page loads.
          </P>
        </Sub>
        <Sub title="Browser storage">
          <P>
            The app sets no cookies. Local storage keeps your theme, network and
            RPC choice, gauge watchlist, dismissed tips, Mezo Academy settings,
            pending Safe batch exports (keyed by wallet address) and your wallet
            connection state. It stays on your device.
          </P>
        </Sub>
      </Section>

      <Section id="discord" title="Matchbox Discord bot">
        <List>
          <li>
            When you use the bot, we receive your Discord user ID, username,
            display name, avatar and server ID. To link a wallet, you sign a
            message with it on the Matchbox app. We store the link and the
            server roles we granted. Unused link requests expire after 15
            minutes.
          </li>
          <li>
            We use the link to add or remove server roles, which means checking
            your wallet's activity on the Matchbox app.
          </li>
          <li>
            Linking is public: anyone can look up the Discord username, display
            name and avatar linked to a wallet address through Matchbox. Do not
            link if you do not want that connection to be visible.
          </li>
          <li>
            You can unlink at any time from the bot or the Matchbox app. That
            deletes the link and removes the roles. Discord processes your data
            under its own privacy policy.
          </li>
        </List>
      </Section>

      <Section id="matchbox-pro" title="Matchbox Pro">
        <List>
          <li>
            Pro uses the wallet you connect, or an address you choose to watch.
            A watched address is kept in your browser's session storage.
          </li>
          <li>
            Stuart, the Pro assistant, answers with built-in rules or, when
            needed, with Anthropic's Claude model. In that case Anthropic
            receives your question, the page you are on (which can contain a
            wallet address) and the Matchbox data used to answer it, such as
            lock IDs and voting power. Your conversation stays in your browser
            tab. Our logs keep a short hash of the question, not its text.
          </li>
          <li>
            Support reports are sent only when you submit one. They contain the
            problem, the items you chose to include (such as your message or
            wallet address), your email if you chose to give it, and a keyed
            hash of your IP address used to limit abuse. They are kept for up to
            90 days.
          </li>
          <li>
            Bridge lookups send your wallet address to Wormholescan. Activity
            views query our activity database or the Matchbox app.
          </li>
          <li>
            Rate limits use your IP address for a short time and do not store
            it. Pro has no analytics and sets no cookies. Browser storage keeps
            your theme, network, watchlist, reward claims, ballot drafts and the
            current Stuart conversation.
          </li>
        </List>
      </Section>

      <Section
        id="matchbox-developer"
        title="Matchbox Developer and the Matchbox API"
      >
        <List>
          <li>
            Google sign-in: your name, email address, whether Google has
            verified it, your profile picture link, your Google account ID and,
            for Google Workspace accounts, the Workspace domain. We store your
            name (as an editable display name), email, profile picture link and
            Google account ID. The Workspace domain is used at sign-in to grant
            staff access and is not stored.
          </li>
          <li>
            Account content: organizations, members and invitations, apps and
            their profile details, environments, redirect URIs, allowed origins,
            scope requests and review notes. Members of an organization can see
            each other's names, email addresses and profile pictures, and the
            organization's apps, settings and usage.
          </li>
          <li>
            Credentials: API keys and client secrets are shown once. We keep
            only a keyed hash and a short prefix.
          </li>
          <li>
            Sessions and security: the browser user agent and a truncated IP
            address (IPv4 /24, IPv6 /48) for each session, and an audit log of
            security-relevant actions with the same truncated IP address.
          </li>
          <li>
            API usage: for each API request, the request ID, API key ID, route,
            method, status, error code, latency, and the Cloudflare data center
            and country. No full IP addresses or request bodies.
          </li>
          <li>
            Email: invitations and review decisions, sent through Cloudflare.
          </li>
          <li>
            Cookies: <Code>__Host-mbx_dev</Code> (your session; up to 12 hours
            after your last activity and at most 7 days) and{" "}
            <Code>__Host-mbx_dev_google</Code> (a single-use sign-in check, 10
            minutes). The Sign in with Google button may set Google cookies
            under Google's privacy policy.
          </li>
        </List>
      </Section>

      <Section id="matchbox-id" title="Matchbox ID">
        <List>
          <li>
            You sign in by signing a message with your wallet. Your account is
            your wallet address with its first and latest sign-in times. We
            check signatures through Mezo RPC providers.
          </li>
          <li>
            Sessions record the browser user agent, a truncated IP address, the
            network and the wallet type. The <Code>__Host-mbx_id</Code> cookie
            keeps you signed in for up to 7 days.
          </li>
          <li>
            When you approve an app, we record the approval (the app, the
            permissions you allowed and declined, and the fields you were shown)
            and give that app its own user ID for you, different for every app.
          </li>
          <li>
            Apps receive only what you approve: your wallet address and network,
            and, if offered, your Discord ID or Discord username, display name
            and avatar. What an app does with that data is governed by the app's
            own privacy policy, linked on the approval screen.
          </li>
          <li>
            You can see and revoke app access at id.matchbox.markets; the app's
            tokens then stop working. If your Discord link changes, apps lose
            access to your Discord data automatically.
          </li>
          <li>
            Sign-ins and approvals are written to an audit log with a truncated
            IP address.
          </li>
        </List>
      </Section>

      <Section title="Service providers">
        <P>
          These providers process data for us: Cloudflare (hosting, network,
          email, rate limiting and usage analytics), Supabase (database, file
          storage and functions), Neon (activity database), Goldsky (blockchain
          indexing), Google (Developer sign-in and fonts), Umami (page view
          counts), Anthropic (the Pro assistant), Discord, WalletConnect
          (Reown), blockchain node providers, Wormholescan and Mezo. Data may be
          processed in the United States and other countries where they operate.
        </P>
      </Section>

      <Section title="Sharing">
        <P>
          Profiles and Discord links are public by design. Apps you approve in
          Matchbox ID receive what you approved. Members of a Developer
          organization see each other as described above. Otherwise we share
          data only with the providers above or when required by law.
        </P>
      </Section>

      <Section title="Retention">
        <List>
          <li>
            Profiles and Discord links: until you change or remove them, or ask
            us to.
          </li>
          <li>
            Matchbox ID and Developer accounts, approvals and session records:
            while the account exists, and session records for security review
            after they expire.
          </li>
          <li>
            Short-lived sign-in records (nonces, codes and tokens): deleted
            within a few days of expiring.
          </li>
          <li>Audit logs: kept for security and cannot be edited.</li>
          <li>Pro support reports: up to 90 days.</li>
          <li>API usage data: about three months.</li>
          <li>Browser storage: on your device until you clear it.</li>
        </List>
        <P>
          When you ask us to delete your data, we delete or anonymize it, except
          records we must keep for security or legal reasons and data on public
          blockchains.
        </P>
      </Section>

      <Section title="Your choices">
        <P>
          You can unlink Discord, revoke app access in Matchbox ID, edit your
          profiles and Developer display name, and clear your browser storage.
          To access, correct, export or delete your data, email <Mail />.
          Depending on where you live, you may have further rights, including to
          object to processing or to complain to a data protection authority.
        </P>
      </Section>

      <Section title="Security">
        <P>
          Traffic is encrypted in transit. Secrets and tokens are stored only as
          keyed hashes, database access is limited to our servers, and sensitive
          Developer actions require a fresh Google confirmation.
        </P>
      </Section>

      <Section title="Children">
        <P>Matchbox is not directed to anyone under 16.</P>
      </Section>

      <Section title="Changes">
        <P>
          We will update the date above when this policy changes and tell
          Matchbox Developer account holders about material changes by email or
          in the console.
        </P>
      </Section>

      <Section title="Contact">
        <P>
          Trellium · <Mail />
        </P>
      </Section>
    </main>
  )
}
