import { Figtree, Martian_Mono } from "next/font/google"
import { type ReactNode, useEffect, useState } from "react"

/**
 * Launch banner for Matchbox Pro, in the look of Pro itself (soft card,
 * Figtree, the Martian Mono lockup): a headline, one feature line that
 * changes every four seconds, and a still screenshot of the Pro Overview.
 * Dismissing it is remembered in this browser. Styles live in globals.css
 * under `.pro-banner`, with a dark palette under `.dark-mode`.
 */

const figtree = Figtree({
  subsets: ["latin"],
  display: "swap",
  variable: "--pb-font",
})
const martianMono = Martian_Mono({
  subsets: ["latin"],
  axes: ["wdth"],
  display: "swap",
  variable: "--pb-mono",
})

const PRO_URL = "https://pro.matchbox.markets"
const DISMISSED_KEY = "matchbox:pro-launch-banner-dismissed"

function StuartBadge(): ReactNode {
  return (
    <span className="pro-banner-stuart">
      <span className="pro-banner-stuart-disc" aria-hidden="true">
        <svg
          viewBox="0 0 24 24"
          width={15}
          height={15}
          fill="none"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          focusable="false"
        >
          <g stroke="var(--pb-soft)">
            <path d="M11.25 16.25h1.5L12 17z" />
            <path d="M16 14v.5" />
            <path d="M4.42 11.247A13.2 13.2 0 0 0 4 14.556C4 18.728 7.582 21 12 21s8-2.272 8-6.444a11.7 11.7 0 0 0-.493-3.309" />
            <path d="M8 14v.5" />
          </g>
          <path
            stroke="#f7931a"
            d="M8.5 8.5c-.384 1.05-1.083 2.028-2.344 2.5c-1.931.722-3.576-.297-3.656-1c-.113-.994 1.177-6.53 4-7c1.923-.321 3.651.845 3.651 2.235A7.5 7.5 0 0 1 14 5.277c0-1.39 1.844-2.598 3.767-2.277c2.823.47 4.113 6.006 4 7c-.08.703-1.725 1.722-3.656 1c-1.261-.472-1.855-1.45-2.239-2.5"
          />
        </svg>
      </span>
      Stuart
    </span>
  )
}

const lines: { key: string; content: ReactNode }[] = [
  {
    key: "stuart",
    content: (
      <>
        <StuartBadge /> finds the best gauges for you
      </>
    ),
  },
  { key: "vote", content: "Vote with every lock at once" },
  { key: "projected", content: "See what this epoch pays before it ends" },
  { key: "claim", content: "Claim everything from one screen" },
  { key: "boost", content: "Know your boost at a glance" },
  { key: "themes", content: "Eight themes, from paper to pure black" },
]

export default function ProLaunchBanner(): ReactNode {
  // Hidden until the stored choice is read, so it never flashes back in.
  const [open, setOpen] = useState(false)

  useEffect(() => {
    try {
      setOpen(window.localStorage.getItem(DISMISSED_KEY) === null)
    } catch {
      setOpen(true)
    }
  }, [])

  if (!open) return null

  function dismiss(): void {
    setOpen(false)
    try {
      window.localStorage.setItem(DISMISSED_KEY, "1")
    } catch {
      // Private mode: it stays closed for this visit.
    }
  }

  return (
    <section
      aria-label="Matchbox Pro"
      className={`pro-banner ${figtree.variable} ${martianMono.variable}`}
    >
      <div className="pro-banner-copy">
        <p className="pro-banner-lockup">
          <img
            src="/matchbox.png"
            alt=""
            width={120}
            height={32}
            className="pro-banner-mark"
          />
          MATCHBOX <span>PRO</span>
        </p>
        <h2 className="pro-banner-headline">Vote like a Pro.</h2>
        <ul className="pro-banner-lines">
          {lines.map((line, index) => (
            <li key={line.key} style={{ animationDelay: `${index * 4}s` }}>
              {line.content}
            </li>
          ))}
        </ul>
        <div className="pro-banner-actions">
          <a
            href={PRO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="pro-banner-open"
          >
            Open Pro
          </a>
          <button type="button" className="pro-banner-later" onClick={dismiss}>
            Not now
          </button>
        </div>
      </div>
      <div className="pro-banner-window" aria-hidden="true">
        <img
          src="/pro/overview-light.png"
          alt=""
          width={1440}
          height={600}
          loading="lazy"
          className="pro-banner-shot-light"
        />
        <img
          src="/pro/overview-dark.png"
          alt=""
          width={1440}
          height={600}
          loading="lazy"
          className="pro-banner-shot-dark"
        />
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        className="pro-banner-close"
        onClick={dismiss}
      >
        <svg
          viewBox="0 0 24 24"
          width={16}
          height={16}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      </button>
    </section>
  )
}
