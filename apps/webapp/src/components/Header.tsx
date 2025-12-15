import { Button, LabelMedium, useStyletron } from "@mezo-org/mezo-clay"
import { useTheme } from "@/contexts/ThemeContext"
import NextLink from "next/link"
import { useRouter } from "next/router"
import { useAccount, useConnect, useDisconnect } from "wagmi"
import { injected } from "wagmi/connectors"

function SunIcon({ color }: { color: string }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
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

function MoonIcon({ color }: { color: string }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  )
}

export function Header() {
  const [css, theme] = useStyletron()
  const router = useRouter()
  const { address, isConnected } = useAccount()
  const { connect } = useConnect()
  const { disconnect } = useDisconnect()
  const { theme: currentTheme, toggleTheme } = useTheme()

  const handleConnect = () => {
    connect({ connector: injected() })
  }

  const navItems = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/gauges", label: "Gauges" },
    { href: "/boost", label: "Boost" },
    { href: "/incentives", label: "Incentives" },
  ]

  return (
    <header
      className={css({
        display: "grid",
        gridTemplateColumns: "1fr auto 1fr",
        alignItems: "center",
        padding: "16px 24px",
        borderBottom: `1px solid ${theme.colors.borderOpaque}`,
        backgroundColor: theme.colors.backgroundPrimary,
      })}
    >
      <div
        className={css({
          display: "flex",
          alignItems: "center",
        })}
      >
        <NextLink href="/" style={{ textDecoration: "none" }}>
          <div
            className={css({
              display: "flex",
              alignItems: "center",
              height: "40px",
            })}
          >
            <img
              src="/matchbox.png"
              alt="Matchbox"
              className={css({
                height: "100%",
                width: "auto",
                imageRendering: "crisp-edges",
                filter: currentTheme === "dark" ? "invert(1)" : "none",
              })}
            />
          </div>
        </NextLink>
      </div>
      <nav
        className={css({
          display: "flex",
          gap: "24px",
          justifyContent: "center",
        })}
      >
        {navItems.map((item) => (
          <NextLink
            key={item.href}
            href={item.href}
            style={{ textDecoration: "none" }}
          >
            <LabelMedium
              color={
                router.pathname === item.href
                  ? theme.colors.contentPrimary
                  : theme.colors.contentSecondary
              }
              overrides={{
                Block: {
                  style: {
                    cursor: "pointer",
                    ":hover": {
                      color: theme.colors.contentPrimary,
                    },
                  },
                },
              }}
            >
              {item.label}
            </LabelMedium>
          </NextLink>
        ))}
      </nav>
      <div
        className={css({
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
          gap: "12px",
        })}
      >
        <Button
          kind="secondary"
          onClick={toggleTheme}
          overrides={{
            BaseButton: {
              style: {
                minWidth: "44px",
                width: "44px",
                height: "44px",
                padding: "0",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              },
            },
          }}
          aria-label={`Switch to ${currentTheme === "light" ? "dark" : "light"} mode`}
        >
          {currentTheme === "light" ? (
            <MoonIcon color={theme.colors.contentPrimary} />
          ) : (
            <SunIcon color={theme.colors.contentPrimary} />
          )}
        </Button>
        {isConnected && address ? (
          <Button kind="secondary" onClick={() => disconnect()}>
            {address.slice(0, 6)}...{address.slice(-4)}
          </Button>
        ) : (
          <Button kind="primary" onClick={handleConnect}>
            Connect Wallet
          </Button>
        )}
      </div>
    </header>
  )
}
