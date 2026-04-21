import { useTheme } from "@/contexts/ThemeContext"
import { Button, Modal, ModalBody } from "@mezo-org/mezo-clay"
import { useWalletAccount } from "@mezo-org/passport"
import dynamic from "next/dynamic"
import NextLink from "next/link"
import { useRouter } from "next/router"
import { useEffect, useMemo, useState } from "react"
import { HeaderTicker } from "./HeaderTicker"

const ConnectWalletDrawer = dynamic(
  () => import("./ConnectWalletDrawer").then((mod) => mod.ConnectWalletDrawer),
  { ssr: false },
)

const WalletDrawer = dynamic(
  () => import("./WalletDrawer").then((mod) => mod.WalletDrawer),
  { ssr: false },
)

const BoostCalculator = dynamic(
  () => import("./BoostCalculator").then((mod) => mod.BoostCalculator),
  { ssr: false },
)

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

function DocIcon(): JSX.Element {
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
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <line x1="10" y1="9" x2="8" y2="9" />
    </svg>
  )
}

function CalculatorIcon(): JSX.Element {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="4" y="2" width="16" height="20" rx="2" />
      <line x1="8" y1="6" x2="16" y2="6" />
      <line x1="8" y1="10" x2="10" y2="10" />
      <line x1="12" y1="10" x2="14" y2="10" />
      <line x1="8" y1="14" x2="10" y2="14" />
      <line x1="12" y1="14" x2="14" y2="14" />
      <line x1="8" y1="18" x2="16" y2="18" />
    </svg>
  )
}

function SettingsIcon(): JSX.Element {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

type NavChild = { href: string; label: string }
type NavItem =
  | { href: string; label: string; children?: never }
  | { label: string; children: NavChild[]; href?: never }

const navItems: NavItem[] = [
  { href: "/dashboard", label: "dashboard" },
  { href: "/boost", label: "veMEZO" },
  { href: "/incentives", label: "veBTC" },
  { href: "/pools", label: "pools" },
  {
    label: "more",
    children: [{ href: "/how-to", label: "how2" }],
  },
]

export function Header(): JSX.Element {
  const router = useRouter()
  const { walletAddress, isConnected } = useWalletAccount()
  const { theme: currentTheme } = useTheme()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [walletDrawerOpen, setWalletDrawerOpen] = useState(false)
  const [connectDrawerOpen, setConnectDrawerOpen] = useState(false)
  const [calculatorOpen, setCalculatorOpen] = useState(false)
  const [moreMenuOpen, setMoreMenuOpen] = useState(false)
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false)

  const isHomePage = router.pathname === "/"

  const isAppDomain = useMemo(() => {
    if (typeof window === "undefined") return false
    return window.location.hostname === "app.matchbox.markets"
  }, [])

  const homeHref = isAppDomain ? "/dashboard" : "/"

  // Format address for display (works for both BTC and EVM addresses)
  const formatAddress = (addr: string | undefined) => {
    if (!addr) return ""
    if (addr.length > 20) {
      return `${addr.slice(0, 6)}...${addr.slice(-4)}`
    }
    return addr
  }

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
    setConnectDrawerOpen(true)
  }

  return (
    <>
      <header
        className="sticky top-0 z-50 border-b border-[var(--border)] bg-[var(--surface)]/95 backdrop-blur-sm"
        style={{ overflow: "visible" }}
      >
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 md:h-16 md:px-6 lg:px-8">
          {/* Logo */}
          <NextLink
            href={homeHref}
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
              if (item.children) {
                const isActive = item.children.some(
                  (c) => c.href === router.pathname,
                )
                return (
                  <div
                    key={item.label}
                    className="relative"
                    onMouseEnter={() => setMoreMenuOpen(true)}
                    onMouseLeave={() => setMoreMenuOpen(false)}
                  >
                    <button
                      type="button"
                      onClick={() => setMoreMenuOpen((o) => !o)}
                      className={`
                        relative flex items-center gap-1 px-3 py-2 text-sm transition-colors
                        ${
                          isActive
                            ? "text-[var(--content-primary)]"
                            : "text-[var(--content-secondary)] hover:text-[var(--content-primary)]"
                        }
                      `}
                      aria-haspopup="menu"
                      aria-expanded={moreMenuOpen}
                    >
                      {isActive && (
                        <span
                          className="mr-1 text-[#F7931A]"
                          aria-hidden="true"
                        >
                          &gt;
                        </span>
                      )}
                      {item.label}
                      <span
                        aria-hidden="true"
                        className="text-xs text-[var(--content-tertiary)]"
                      >
                        ▾
                      </span>
                      {isActive && (
                        <span
                          className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#F7931A]"
                          aria-hidden="true"
                        />
                      )}
                    </button>
                    {moreMenuOpen && (
                      <div className="absolute left-0 top-full z-50 pt-1">
                        <div
                          role="menu"
                          className="min-w-[160px] overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-lg"
                        >
                          {item.children.map((child) => {
                            const childActive = router.pathname === child.href
                            return (
                              <NextLink
                                key={child.href}
                                href={child.href}
                                className={`
                                flex items-center px-3 py-2 text-sm transition-colors
                                ${
                                  childActive
                                    ? "bg-[var(--surface-secondary)] text-[var(--content-primary)]"
                                    : "text-[var(--content-secondary)] hover:bg-[var(--surface-secondary)] hover:text-[var(--content-primary)]"
                                }
                              `}
                                style={{ textDecoration: "none" }}
                                onClick={() => setMoreMenuOpen(false)}
                                role="menuitem"
                              >
                                {childActive && (
                                  <span
                                    className="mr-1 text-[#F7931A]"
                                    aria-hidden="true"
                                  >
                                    &gt;
                                  </span>
                                )}
                                {child.label}
                              </NextLink>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )
              }

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
            {!isHomePage && (
              <div className="ticker-navbar-enter">
                <HeaderTicker />
              </div>
            )}

            <a
              href="https://matchbox.markets/docs"
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--content-secondary)] transition-colors hover:bg-[var(--surface-secondary)] hover:text-[var(--content-primary)]"
              aria-label="View documentation"
            >
              <DocIcon />
            </a>

            {isConnected && walletAddress ? (
              <Button
                kind="secondary"
                onClick={() => setWalletDrawerOpen(true)}
                overrides={{
                  BaseButton: {
                    style: {
                      height: "40px",
                    },
                  },
                }}
              >
                <span className="flex items-center gap-2 font-mono text-xs tabular-nums">
                  <span className="h-2 w-2 rounded-full bg-[#22C55E] shadow-[0_0_6px_rgba(34,197,94,0.5)]" />
                  {formatAddress(walletAddress)}
                  <SettingsIcon />
                </span>
              </Button>
            ) : (
              <Button
                kind="primary"
                onClick={handleConnect}
                overrides={{
                  BaseButton: {
                    style: {
                      height: "40px",
                    },
                  },
                }}
              >
                <span className="flex items-center gap-2">
                  <TerminalIcon />
                  connect
                </span>
              </Button>
            )}
          </div>

          {walletDrawerOpen && (
            <WalletDrawer
              isOpen={walletDrawerOpen}
              onClose={() => setWalletDrawerOpen(false)}
            />
          )}
          {connectDrawerOpen && (
            <ConnectWalletDrawer
              isOpen={connectDrawerOpen}
              onClose={() => setConnectDrawerOpen(false)}
            />
          )}

          {/* Boost Calculator Modal */}
          <Modal
            isOpen={calculatorOpen}
            onClose={() => setCalculatorOpen(false)}
            overrides={{
              Dialog: {
                style: {
                  maxWidth: "420px",
                  width: "100%",
                  padding: "0",
                },
              },
              Close: {
                style: {
                  top: "12px",
                  right: "12px",
                },
              },
            }}
          >
            <ModalBody
              $style={{
                padding: "16px",
              }}
            >
              <BoostCalculator />
            </ModalBody>
          </Modal>

          {/* Mobile Actions */}
          <div className="flex items-center gap-2 md:hidden">
            <a
              href="https://matchbox.markets/docs"
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-11 w-11 items-center justify-center rounded-lg text-[var(--content-secondary)] transition-colors hover:bg-[var(--surface-secondary)] hover:text-[var(--content-primary)]"
              aria-label="View documentation"
            >
              <DocIcon />
            </a>

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

        {/* Boost Calculator tab – peeks below header */}
        <button
          type="button"
          onClick={() => setCalculatorOpen(true)}
          className="absolute bottom-0 right-4 z-40 hidden translate-y-full items-center gap-1.5 rounded-b-lg border border-t-0 border-[var(--border)] bg-[var(--surface)]/95 px-3 py-1 text-[11px] font-medium text-[var(--content-secondary)] backdrop-blur-sm transition-colors hover:bg-[var(--surface-secondary)] hover:text-[#F7931A] md:flex md:right-6 lg:right-8"
        >
          <CalculatorIcon />
          Boost Calculator
        </button>
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
              if (item.children) {
                const hasActive = item.children.some(
                  (c) => c.href === router.pathname,
                )
                return (
                  <div key={item.label} className="flex flex-col">
                    <button
                      type="button"
                      onClick={() => setMobileMoreOpen((o) => !o)}
                      className={`
                        flex items-center justify-between rounded-lg px-4 py-3 text-lg transition-colors
                        ${
                          hasActive
                            ? "bg-[var(--surface-secondary)] text-[var(--content-primary)]"
                            : "text-[var(--content-secondary)] hover:bg-[var(--surface-secondary)] hover:text-[var(--content-primary)]"
                        }
                      `}
                      aria-expanded={mobileMoreOpen}
                    >
                      <span className="flex items-center">
                        {hasActive && (
                          <span
                            className="mr-2 text-[#F7931A]"
                            aria-hidden="true"
                          >
                            &gt;
                          </span>
                        )}
                        {item.label}
                      </span>
                      <span
                        aria-hidden="true"
                        className="text-sm text-[var(--content-tertiary)]"
                      >
                        {mobileMoreOpen ? "▴" : "▾"}
                      </span>
                    </button>
                    {mobileMoreOpen && (
                      <div className="ml-4 mt-1 flex flex-col gap-1 border-l border-[var(--border)] pl-2">
                        {item.children.map((child) => {
                          const childActive = router.pathname === child.href
                          return (
                            <NextLink
                              key={child.href}
                              href={child.href}
                              className={`
                                flex items-center rounded-lg px-4 py-2 text-base transition-colors
                                ${
                                  childActive
                                    ? "bg-[var(--surface-secondary)] text-[var(--content-primary)]"
                                    : "text-[var(--content-secondary)] hover:bg-[var(--surface-secondary)] hover:text-[var(--content-primary)]"
                                }
                              `}
                              style={{ textDecoration: "none" }}
                              onClick={() => setMobileMenuOpen(false)}
                            >
                              {childActive && (
                                <span
                                  className="mr-2 text-[#F7931A]"
                                  aria-hidden="true"
                                >
                                  &gt;
                                </span>
                              )}
                              {child.label}
                            </NextLink>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              }

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

            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false)
                setCalculatorOpen(true)
              }}
              className="flex items-center rounded-lg px-4 py-3 text-lg text-[var(--content-secondary)] transition-colors hover:bg-[var(--surface-secondary)] hover:text-[var(--content-primary)]"
              style={{ textDecoration: "none" }}
            >
              <span className="mr-2 flex items-center">
                <CalculatorIcon />
              </span>
              Boost Calculator
            </button>
          </nav>

          <div className="mt-auto border-t border-[var(--border)] p-4">
            {isConnected && walletAddress ? (
              <Button
                kind="secondary"
                onClick={() => {
                  setMobileMenuOpen(false)
                  setWalletDrawerOpen(true)
                }}
                overrides={{
                  BaseButton: {
                    style: {
                      width: "100%",
                    },
                  },
                }}
              >
                <span className="flex items-center justify-center gap-2 font-mono text-xs">
                  <span className="h-2 w-2 rounded-full bg-[#22C55E] shadow-[0_0_6px_rgba(34,197,94,0.5)]" />
                  {formatAddress(walletAddress)}
                  <SettingsIcon />
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
