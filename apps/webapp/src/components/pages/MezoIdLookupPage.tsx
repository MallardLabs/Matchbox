import { ClickableAddress } from "@/components/ClickableAddress"
import { SpringIn } from "@/components/SpringIn"
import { useNetwork } from "@/contexts/NetworkContext"
import {
  type MezoIdLookup,
  type MezoIdNetwork,
  mezoIdLookupSchema,
  parseMezoIdQuery,
} from "@/lib/mezoId"
import { useQuery } from "@tanstack/react-query"
import { useRouter } from "next/router"
import { type FormEvent, Fragment, useEffect, useState } from "react"

async function fetchMezoIdLookup(
  network: MezoIdNetwork,
  query: string,
): Promise<MezoIdLookup> {
  const response = await fetch(
    `/api/mezo-id/${network}?q=${encodeURIComponent(query)}`,
  )
  if (!response.ok) {
    throw new Error(`Lookup failed (${response.status}). Try again shortly.`)
  }
  return mezoIdLookupSchema.parse(await response.json())
}

function CopyButton({ value }: { value: string }): JSX.Element {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch {
      // clipboard access denied — nothing useful to show
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="rounded px-1.5 py-0.5 text-2xs text-[var(--content-tertiary)] transition-colors hover:bg-[var(--surface-secondary)] hover:text-[#F7931A]"
    >
      {copied ? "copied" : "copy"}
    </button>
  )
}

function ResultRow({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}): JSX.Element {
  return (
    <div className="flex flex-col gap-1 border-t border-[var(--border)] py-3 first:border-t-0 sm:flex-row sm:items-center sm:gap-4">
      <dt className="w-32 flex-none text-xs text-[var(--content-tertiary)]">
        {label}
      </dt>
      <dd className="flex min-w-0 items-center gap-1 break-all font-mono text-sm text-[var(--content-primary)]">
        {children}
      </dd>
    </div>
  )
}

function Results({ lookup }: { lookup: MezoIdLookup }): JSX.Element {
  if (lookup.status === "invalid") {
    return (
      <p className="text-sm text-[var(--content-secondary)]">
        That doesn't look like a Mezo ID, EVM address, or Bitcoin address.
      </p>
    )
  }

  if (lookup.status === "not-found") {
    return (
      <div className="flex flex-col gap-2 text-sm text-[var(--content-secondary)]">
        <p>No Mezo account found.</p>
        <p className="text-xs text-[var(--content-tertiary)]">
          Accounts that signed up with a Bitcoin wallet can't be found by their
          EVM address. Try the Bitcoin address or Mezo ID instead.
        </p>
      </div>
    )
  }

  return (
    <dl>
      <ResultRow label="Mezo ID">
        {lookup.mezoId ? (
          <>
            {lookup.mezoId}
            <CopyButton value={lookup.mezoId} />
          </>
        ) : (
          <span className="text-[var(--content-tertiary)]">none claimed</span>
        )}
      </ResultRow>
      {lookup.wallets.map((wallet) => (
        <Fragment key={wallet.evmAddress}>
          <ResultRow label="EVM address">
            <ClickableAddress
              address={wallet.evmAddress}
              label={wallet.evmAddress}
              className="!text-sm break-all"
            />
          </ResultRow>
          <ResultRow label="Bitcoin address">
            {wallet.btcAddress ? (
              <>
                {wallet.btcAddress}
                <CopyButton value={wallet.btcAddress} />
              </>
            ) : (
              <span className="text-[var(--content-tertiary)]">
                none (EVM wallet)
              </span>
            )}
          </ResultRow>
        </Fragment>
      ))}
    </dl>
  )
}

export default function MezoIdLookupPage(): JSX.Element {
  const router = useRouter()
  const { isMainnet } = useNetwork()
  const network: MezoIdNetwork = isMainnet ? "mainnet" : "testnet"
  const [input, setInput] = useState("")
  const [submitted, setSubmitted] = useState<string | null>(null)

  const urlQuery = typeof router.query.q === "string" ? router.query.q : null

  useEffect(() => {
    if (!urlQuery) return
    setInput(urlQuery)
    setSubmitted(urlQuery)
  }, [urlQuery])

  const lookup = useQuery({
    queryKey: ["mezo-id-lookup", network, submitted],
    queryFn: () => fetchMezoIdLookup(network, submitted ?? ""),
    enabled: submitted !== null,
    staleTime: 5 * 60 * 1000,
  })

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const parsed = parseMezoIdQuery(input)
    const q = parsed?.value ?? input.trim()
    if (q === "") return
    setSubmitted(q)
    void router.replace({ query: { q } }, undefined, { shallow: true })
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 md:py-12">
      <SpringIn delay={0} variant="card">
        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
          <h1 className="font-mono text-2xl text-[var(--content-primary)] md:text-3xl">
            ID lookup
          </h1>
          <p className="mt-2 text-sm text-[var(--content-secondary)]">
            Enter a Mezo ID, EVM address, or Bitcoin address to find the others.
          </p>
          <form onSubmit={handleSubmit} className="mt-5">
            <fieldset className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <legend className="sr-only">Account identifier</legend>
              <ol className="contents">
                <li className="flex flex-1 flex-col gap-1">
                  <label
                    htmlFor="mezo-id-lookup-input"
                    className="text-xs text-[var(--content-tertiary)]"
                  >
                    Mezo ID or address
                  </label>
                  <input
                    id="mezo-id-lookup-input"
                    type="text"
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    placeholder="alice.mezo, 0x…, or bc1…"
                    autoComplete="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    className="rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] px-3 py-2 font-mono text-sm text-[var(--content-primary)]"
                  />
                </li>
              </ol>
              <button
                type="submit"
                disabled={input.trim() === "" || lookup.isFetching}
                className="rounded-lg bg-[#F7931A] px-4 py-2 text-sm font-medium text-black transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {lookup.isFetching ? "Looking up…" : "Look up"}
              </button>
            </fieldset>
          </form>
        </section>
      </SpringIn>
      {submitted !== null && (
        <SpringIn delay={1} variant="card">
          <section
            aria-live="polite"
            className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6"
          >
            {lookup.isPending ? (
              <p className="text-sm text-[var(--content-secondary)]">
                Looking up…
              </p>
            ) : lookup.isError ? (
              <p className="text-sm text-[var(--negative)]">
                {lookup.error.message}
              </p>
            ) : (
              <Results lookup={lookup.data} />
            )}
          </section>
        </SpringIn>
      )}
    </div>
  )
}
