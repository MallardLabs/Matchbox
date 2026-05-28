import { useBlacklist } from "@/hooks/useBlacklist"
import { useState } from "react"
import type { Address } from "viem"

type Props = {
  droppedCount: number
}

function shortAddress(addr: Address): string {
  if (addr.length <= 12) return addr
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

export default function AcademyBlacklist({ droppedCount }: Props) {
  const { seed, userAdditions, add, remove, hydrated } = useBlacklist()
  const [input, setInput] = useState("")
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = () => {
    const result = add(input)
    if (result.ok) {
      setInput("")
      setError(null)
    } else {
      setError(result.reason)
    }
  }

  return (
    <div className="rounded border border-[var(--border)] bg-[var(--surface)] p-3">
      <div className="mb-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--content-primary)]">
          Address Blacklist
        </h4>
        <p className="mt-0.5 text-[11px] leading-snug text-[var(--content-secondary)]">
          Excluded from both lock and vote tracks. Additions persist in this
          browser; seed entries come from the codebase.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex gap-1.5">
          <input
            type="text"
            value={input}
            placeholder="0x…"
            spellCheck={false}
            onChange={(e) => {
              setInput(e.target.value)
              if (error) setError(null)
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                handleSubmit()
              }
            }}
            className="flex-1 rounded border border-[var(--border)] bg-[var(--surface-tertiary)] px-2 py-1 font-mono text-xs text-[var(--content-primary)] outline-none focus:border-[#F7931A]"
          />
          <button
            type="button"
            onClick={handleSubmit}
            className="rounded bg-[#F7931A] px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-white hover:bg-[#E8820C]"
          >
            Add
          </button>
        </div>
        {error ? (
          <p className="text-[11px] leading-snug text-red-400">{error}</p>
        ) : null}
      </div>

      <div className="mt-3">
        <div className="mb-1 text-[11px] uppercase tracking-wider text-[var(--content-secondary)]">
          Your additions
          {hydrated ? ` (${userAdditions.length})` : ""}
        </div>
        {!hydrated ? (
          <p className="text-[11px] leading-snug text-[var(--content-tertiary)]">
            Loading…
          </p>
        ) : userAdditions.length === 0 ? (
          <p className="text-[11px] leading-snug text-[var(--content-tertiary)]">
            None yet. Paste a system address above to exclude it.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {userAdditions.map((addr) => (
              <li
                key={addr}
                className="flex items-center justify-between gap-2 rounded bg-[var(--surface-tertiary)] px-2 py-1"
              >
                <code
                  className="truncate font-mono text-[11px] text-[var(--content-primary)]"
                  title={addr}
                >
                  {shortAddress(addr)}
                </code>
                <button
                  type="button"
                  onClick={() => remove(addr)}
                  className="text-[11px] font-semibold uppercase tracking-wider text-[var(--content-secondary)] hover:text-red-400"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {seed.length > 0 ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-[11px] uppercase tracking-wider text-[var(--content-secondary)]">
            Seed list ({seed.length})
          </summary>
          <ul className="mt-1 flex flex-col gap-1">
            {seed.map((addr) => (
              <li
                key={addr}
                className="rounded bg-[var(--surface-tertiary)] px-2 py-1"
              >
                <code
                  className="font-mono text-[11px] text-[var(--content-secondary)]"
                  title={addr}
                >
                  {shortAddress(addr)}
                </code>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <div className="mt-3 flex items-baseline justify-between border-t border-[var(--border)] pt-2 text-[11px]">
        <span className="uppercase tracking-wider text-[var(--content-secondary)]">
          Dropped events (this run)
        </span>
        <span className="font-mono text-[var(--content-primary)]">
          {droppedCount.toLocaleString()}
        </span>
      </div>
    </div>
  )
}
