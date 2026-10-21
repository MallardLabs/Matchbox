import { CLASSIC_URL } from "@/lib/banner"
import * as AppShell from "@repo/ui/app-shell"
import * as Dialog from "@repo/ui/dialog"
import * as ThemeToggle from "@repo/ui/theme-toggle"
import { Link, useRouterState } from "@tanstack/react-router"
import { ArrowUpRight, Menu } from "lucide-react"
import { type ReactElement, useState } from "react"
import XLogo from "./XLogo"
import { X_URL, isNavActive, moreNav, primaryNav } from "./nav"

/** Bottom tab bar below 768px: three destinations plus More. */
export default function MobileNav(): ReactElement {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const [moreOpen, setMoreOpen] = useState(false)
  const moreActive = moreNav.some(
    (item) => item.kind === "internal" && isNavActive(item.to, pathname),
  )

  return (
    <>
      <AppShell.MobileNav>
        {primaryNav.map((item) => (
          <AppShell.MobileNavItem
            key={item.to}
            asChild
            label={item.label}
            active={isNavActive(item.to, pathname)}
            icon={<item.icon size={20} strokeWidth={1.75} />}
          >
            <Link to={item.to} />
          </AppShell.MobileNavItem>
        ))}
        <li>
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            aria-current={moreActive ? "page" : undefined}
            className={
              moreActive
                ? "flex h-full w-full flex-col items-center justify-center gap-1 text-caption font-600 text-ink [&_svg]:text-accent"
                : "flex h-full w-full flex-col items-center justify-center gap-1 text-caption font-500 text-secondary"
            }
          >
            <Menu aria-hidden="true" size={20} strokeWidth={1.75} />
            More
          </button>
        </li>
      </AppShell.MobileNav>

      <Dialog.Root open={moreOpen} onOpenChange={setMoreOpen}>
        <Dialog.Content
          placement="sheet"
          size="sm"
          aria-describedby={undefined}
        >
          <Dialog.Header>
            <Dialog.Title>More</Dialog.Title>
          </Dialog.Header>
          <nav aria-label="More">
            <ul className="m-0 flex list-none flex-col gap-1 p-0">
              {moreNav.map((item) => (
                <li key={item.label}>
                  {item.kind === "internal" ? (
                    <Link
                      to={item.to}
                      onClick={() => setMoreOpen(false)}
                      className="flex h-12 items-center gap-3 rounded-lg px-3 text-nav font-500 text-ink hover:bg-inset"
                    >
                      <item.icon
                        aria-hidden="true"
                        size={18}
                        strokeWidth={1.75}
                        className="text-secondary"
                      />
                      {item.label}
                    </Link>
                  ) : (
                    <a
                      href={item.href}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`${item.label} (opens in a new tab)`}
                      className="flex h-12 items-center gap-3 rounded-lg px-3 text-nav font-500 text-ink hover:bg-inset"
                    >
                      <item.icon
                        aria-hidden="true"
                        size={18}
                        strokeWidth={1.75}
                        className="text-secondary"
                      />
                      <span className="flex-1">{item.label}</span>
                      <ArrowUpRight
                        aria-hidden="true"
                        size={15}
                        className="text-muted"
                      />
                    </a>
                  )}
                </li>
              ))}
              <li>
                <a
                  href={CLASSIC_URL}
                  className="flex h-12 items-center gap-3 rounded-lg px-3 text-nav font-500 text-ink hover:bg-inset"
                >
                  <span className="w-[18px]" />
                  <span className="flex-1">Matchbox Classic</span>
                  <ArrowUpRight
                    aria-hidden="true"
                    size={15}
                    className="text-muted"
                  />
                </a>
              </li>
            </ul>
          </nav>
          <div className="flex items-center justify-between border-t border-line pt-4">
            <ThemeToggle.Root />
            <a
              href={X_URL}
              target="_blank"
              rel="noreferrer"
              aria-label="Matchbox on X"
              className="flex size-9 items-center justify-center rounded-lg bg-inset-2 text-ink-2"
            >
              <XLogo size={14} />
            </a>
          </div>
        </Dialog.Content>
      </Dialog.Root>
    </>
  )
}
