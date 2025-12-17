import { useTheme } from "@/contexts/ThemeContext"
import { Button } from "@mezo-org/mezo-clay"
import NextLink from "next/link"
import { useRouter } from "next/router"
import { useEffect, useState } from "react"
import { useAccount, useConnect, useDisconnect } from "wagmi"
import { injected } from "wagmi/connectors"
import { TokenPrices } from "./TokenPrices"

function SunIcon(): JSX.Element {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  )
}

function MoonIcon(): JSX.Element {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  )
}

function MenuIcon(): JSX.Element {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  )
}

function CloseIcon(): JSX.Element {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

function TerminalIcon(): JSX.Element {
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
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  )
}

const navItems = [
  { href: "/dashboard", label: "dashboard" },
  { href: "/gauges", label: "gauges" },
  { href: "/boost", label: "boost" },
  { href: "/incentives", label: "incentives" },
]

export function Header(): JSX.Element {
  const router = useRouter()
  const { address, isConnected } = useAccount()
  const { connect } = useConnect()
  const { disconnect } = useDisconnect()
  const { theme: currentTheme, toggleTheme } = useTheme()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => {
    setMobileMenuOpen(false)
  }, [router.pathname])

  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = ""
    }
    return () => {
      document.body.style.overflow = ""
    }
  }, [mobileMenuOpen])

  const handleConnect = () => {
    connect({ connector: injected() })
  }

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-[var(--border)] bg-[var(--surface)]/95 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 md:h-16 md:px-6 lg:px-8">
          {/* Logo */}
          <NextLink
            href="/"
            className="flex items-center gap-2 text-[var(--content-primary)] no-underline transition-opacity hover:opacity-80"
          >
            <img
              src="/matchbox.png"
              alt=""
              width={120}
              height={32}
              className="h-7 w-auto dark-mode:invert md:h-8"
              style={{
                imageRendering: "crisp-edges",
                filter: currentTheme === "dark" ? "invert(1)" : "none",
              }}
            />
          </NextLink>

          {/* Desktop Navigation */}
          <nav
            className="hidden items-center gap-1 md:flex"
            aria-label="Main navigation"
          >
            {navItems.map((item) => {
              const isActive = router.pathname === item.href
              return (
                <NextLink
                  key={item.href}
                  href={item.href}
                  className={`
                    relative px-3 py-2 text-sm transition-colors
                    ${
                      isActive
                        ? "text-[var(--content-primary)]"
                        : "text-[var(--content-secondary)] hover:text-[var(--content-primary)]"
                    }
                  `}
                  style={{ textDecoration: "none" }}
                >
                  {isActive && (
                    <span className="mr-1 text-[#F7931A]" aria-hidden="true">
                      &gt;
                    </span>
                  )}
                  {item.label}
                  {isActive && (
                    <span
                      className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#F7931A]"
                      aria-hidden="true"
                    />
                  )}
                </NextLink>
              )
            })}
          </nav>

          {/* Desktop Actions */}
          <div className="hidden items-center gap-3 md:flex">
            <TokenPrices />

            <button
              type="button"
              onClick={toggleTheme}
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--content-secondary)] transition-colors hover:bg-[var(--surface-secondary)] hover:text-[var(--content-primary)]"
              aria-label={`Switch to ${currentTheme === "light" ? "dark" : "light"} mode`}
            >
              {currentTheme === "light" ? <MoonIcon /> : <SunIcon />}
            </button>

            {isConnected && address ? (
              <Button kind="secondary" onClick={() => disconnect()}>
                <span className="font-mono text-xs tabular-nums">
                  {address.slice(0, 6)}...{address.slice(-4)}
                </span>
              </Button>
            ) : (
              <Button kind="primary" onClick={handleConnect}>
                <span className="flex items-center gap-2">
                  <TerminalIcon />
                  connect
                </span>
              </Button>
            )}
          </div>

          {/* Mobile Actions */}
          <div className="flex items-center gap-2 md:hidden">
            <button
              type="button"
              onClick={toggleTheme}
              className="flex h-11 w-11 items-center justify-center rounded-lg text-[var(--content-secondary)] transition-colors hover:bg-[var(--surface-secondary)] hover:text-[var(--content-primary)]"
              aria-label={`Switch to ${currentTheme === "light" ? "dark" : "light"} mode`}
            >
              {currentTheme === "light" ? <MoonIcon /> : <SunIcon />}
            </button>

            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="flex h-11 w-11 items-center justify-center rounded-lg text-[var(--content-secondary)] transition-colors hover:bg-[var(--surface-secondary)] hover:text-[var(--content-primary)]"
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-menu"
              aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
            >
              {mobileMenuOpen ? <CloseIcon /> : <MenuIcon />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div
          id="mobile-menu"
          className="fixed inset-0 top-14 z-40 flex flex-col bg-[var(--surface)] md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Mobile navigation menu"
        >
          <nav
            className="flex flex-col gap-1 p-4"
            aria-label="Mobile navigation"
          >
            {navItems.map((item) => {
              const isActive = router.pathname === item.href
              return (
                <NextLink
                  key={item.href}
                  href={item.href}
                  className={`
                    flex items-center rounded-lg px-4 py-3 text-lg transition-colors
                    ${
                      isActive
                        ? "bg-[var(--surface-secondary)] text-[var(--content-primary)]"
                        : "text-[var(--content-secondary)] hover:bg-[var(--surface-secondary)] hover:text-[var(--content-primary)]"
                    }
                  `}
                  style={{ textDecoration: "none" }}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {isActive && (
                    <span className="mr-2 text-[#F7931A]" aria-hidden="true">
                      &gt;
                    </span>
                  )}
                  {item.label}
                </NextLink>
              )
            })}
          </nav>

          <div className="mt-auto border-t border-[var(--border)] p-4">
            {isConnected && address ? (
              <Button
                kind="secondary"
                onClick={() => {
                  disconnect()
                  setMobileMenuOpen(false)
                }}
                overrides={{
                  BaseButton: {
                    style: {
                      width: "100%",
                    },
                  },
                }}
              >
                <span className="font-mono text-xs">
                  disconnect ({address.slice(0, 6)}...{address.slice(-4)})
                </span>
              </Button>
            ) : (
              <Button
                kind="primary"
                onClick={() => {
                  handleConnect()
                  setMobileMenuOpen(false)
                }}
                overrides={{
                  BaseButton: {
                    style: {
                      width: "100%",
                    },
                  },
                }}
              >
                <span className="flex items-center justify-center gap-2">
                  <TerminalIcon />
                  connect wallet
                </span>
              </Button>
            )}
          </div>
        </div>
      )}
    </>
  )
}
