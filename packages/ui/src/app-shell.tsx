import { Slot, Slottable } from "@radix-ui/react-slot"
import {
  type AnchorHTMLAttributes,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
  createContext,
  forwardRef,
  useContext,
} from "react"
import { cn } from "./cn"

const ROOT_NAME = "AppShell"
const SKIP_LINK_NAME = "AppShellSkipLink"
const SIDEBAR_NAME = "AppShellSidebar"
const SIDEBAR_HEADER_NAME = "AppShellSidebarHeader"
const SIDEBAR_NAV_NAME = "AppShellSidebarNav"
const SIDEBAR_SECTION_NAME = "AppShellSidebarSection"
const SIDEBAR_ITEM_NAME = "AppShellSidebarItem"
const SIDEBAR_FOOTER_NAME = "AppShellSidebarFooter"
const BODY_NAME = "AppShellBody"
const TOP_BAR_NAME = "AppShellTopBar"
const MAIN_NAME = "AppShellMain"
const MOBILE_NAV_NAME = "AppShellMobileNav"
const MOBILE_NAV_ITEM_NAME = "AppShellMobileNavItem"

export const MAIN_ID = "main-content"

const CollapsedContext = createContext(false)

export const Root = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function AppShell({ className, ...props }, ref): ReactElement {
    return (
      <div
        ref={ref}
        className={cn("flex min-h-dvh bg-canvas text-ink", className)}
        {...props}
      />
    )
  },
)
Root.displayName = ROOT_NAME

export const SkipLink = forwardRef<
  HTMLAnchorElement,
  AnchorHTMLAttributes<HTMLAnchorElement>
>(function AppShellSkipLink(
  { className, children, href = `#${MAIN_ID}`, ...props },
  ref,
): ReactElement {
  return (
    <a
      ref={ref}
      href={href}
      className={cn(
        "sr-only z-[70] rounded-md bg-surface px-3 py-2 text-[13px] font-600 text-ink shadow-pop focus:not-sr-only focus:fixed focus:left-3 focus:top-3",
        className,
      )}
      {...props}
    >
      {children ?? "Skip to content"}
    </a>
  )
})
SkipLink.displayName = SKIP_LINK_NAME

export type SidebarProps = HTMLAttributes<HTMLElement> & {
  /** Icon rail (72px) instead of the full 280px column. */
  collapsed?: boolean
}

/** Desktop sidebar (md and up). Pair with MobileNav below md. */
export const Sidebar = forwardRef<HTMLElement, SidebarProps>(
  function AppShellSidebar(
    { collapsed = false, className, ...props },
    ref,
  ): ReactElement {
    return (
      <CollapsedContext.Provider value={collapsed}>
        <aside
          ref={ref}
          data-collapsed={collapsed || undefined}
          className={cn(
            "sticky top-0 hidden h-dvh shrink-0 flex-col self-start overflow-y-auto border-r border-line bg-surface md:flex",
            collapsed
              ? "w-[72px] items-center px-3 pb-5 pt-6"
              : "w-[280px] px-[18px] pb-[22px] pt-7",
            className,
          )}
          {...props}
        />
      </CollapsedContext.Provider>
    )
  },
)
Sidebar.displayName = SIDEBAR_NAME

export const SidebarHeader = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(function AppShellSidebarHeader({ className, ...props }, ref): ReactElement {
  const collapsed = useContext(CollapsedContext)
  return (
    <div
      ref={ref}
      className={cn(
        collapsed
          ? "flex flex-col items-center gap-3"
          : "flex h-[25px] items-center justify-between",
        className,
      )}
      {...props}
    />
  )
})
SidebarHeader.displayName = SIDEBAR_HEADER_NAME

export const SidebarNav = forwardRef<HTMLElement, HTMLAttributes<HTMLElement>>(
  function AppShellSidebarNav(
    { className, "aria-label": ariaLabel = "Primary", ...props },
    ref,
  ): ReactElement {
    const collapsed = useContext(CollapsedContext)
    return (
      <nav
        ref={ref}
        aria-label={ariaLabel}
        className={cn(
          "flex w-full flex-col",
          collapsed ? "mt-6 gap-4" : "mt-9",
          className,
        )}
        {...props}
      />
    )
  },
)
SidebarNav.displayName = SIDEBAR_NAV_NAME

export type SidebarSectionProps = HTMLAttributes<HTMLDivElement> & {
  /** Small uppercase group label ("More"); hidden in the icon rail. */
  label?: string
}

export const SidebarSection = forwardRef<HTMLDivElement, SidebarSectionProps>(
  function AppShellSidebarSection(
    { label, className, children, ...props },
    ref,
  ): ReactElement {
    const collapsed = useContext(CollapsedContext)
    return (
      <div ref={ref} className={cn("flex flex-col", className)} {...props}>
        {label && !collapsed ? (
          <p className="px-3 pb-0.5 pt-[18px] text-[11px] font-650 uppercase tracking-[0.04em] text-secondary">
            {label}
          </p>
        ) : null}
        <ul
          aria-label={label}
          className="m-0 flex list-none flex-col gap-1 p-0"
        >
          {children}
        </ul>
      </div>
    )
  },
)
SidebarSection.displayName = SIDEBAR_SECTION_NAME

export type NavItemProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  label: ReactNode
  icon?: ReactNode
  active?: boolean
  /**
   * Render the router's link as the item: pass it as the only child with no
   * children of its own, e.g. `<SidebarItem asChild label="Apps"><Link to="/apps" /></SidebarItem>`.
   */
  asChild?: boolean
}

export const SidebarItem = forwardRef<HTMLAnchorElement, NavItemProps>(
  function AppShellSidebarItem(
    {
      label,
      icon,
      active = false,
      asChild = false,
      className,
      children,
      ...props
    },
    ref,
  ): ReactElement {
    const collapsed = useContext(CollapsedContext)
    const Comp = asChild ? Slot : "a"
    return (
      <li>
        <Comp
          ref={ref}
          aria-current={active ? "page" : undefined}
          title={collapsed && typeof label === "string" ? label : undefined}
          className={cn(
            "flex h-11 items-center rounded-lg text-[15px] transition-colors [&_svg]:shrink-0",
            collapsed ? "w-12 justify-center" : "gap-3 px-2.5",
            active
              ? "bg-inset font-600 text-ink [&_svg]:text-accent"
              : "font-500 text-secondary hover:bg-inset hover:text-ink",
            className,
          )}
          {...props}
        >
          {collapsed ? null : (
            <span
              aria-hidden="true"
              className={cn(
                "h-[18px] w-[3px] shrink-0 rounded-sm",
                active ? "bg-accent" : "bg-transparent",
              )}
            />
          )}
          {icon ? (
            <span aria-hidden="true" className="flex items-center">
              {icon}
            </span>
          ) : null}
          <Slottable>{children}</Slottable>
          <span className={cn("truncate", collapsed && "sr-only")}>
            {label}
          </span>
        </Comp>
      </li>
    )
  },
)
SidebarItem.displayName = SIDEBAR_ITEM_NAME

export const SidebarFooter = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(function AppShellSidebarFooter({ className, ...props }, ref): ReactElement {
  const collapsed = useContext(CollapsedContext)
  return (
    <div
      ref={ref}
      className={cn(
        "mt-auto flex items-center gap-2 pt-6",
        collapsed && "flex-col",
        className,
      )}
      {...props}
    />
  )
})
SidebarFooter.displayName = SIDEBAR_FOOTER_NAME

/** Column holding TopBar and Main beside the sidebar. */
export const Body = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function AppShellBody({ className, ...props }, ref): ReactElement {
    return (
      <div
        ref={ref}
        className={cn("flex min-w-0 flex-1 flex-col", className)}
        {...props}
      />
    )
  },
)
Body.displayName = BODY_NAME

export const TopBar = forwardRef<HTMLElement, HTMLAttributes<HTMLElement>>(
  function AppShellTopBar({ className, ...props }, ref): ReactElement {
    return (
      <header
        ref={ref}
        className={cn(
          "sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b border-line bg-surface px-4 md:h-[72px] md:gap-4 md:px-6",
          className,
        )}
        {...props}
      />
    )
  },
)
TopBar.displayName = TOP_BAR_NAME

export const Main = forwardRef<HTMLElement, HTMLAttributes<HTMLElement>>(
  function AppShellMain(
    { className, id = MAIN_ID, ...props },
    ref,
  ): ReactElement {
    return (
      <main
        ref={ref}
        id={id}
        tabIndex={-1}
        className={cn(
          "min-w-0 flex-1 overflow-x-clip px-4 pb-24 pt-5 outline-none md:px-8 md:pb-10 md:pt-7",
          className,
        )}
        {...props}
      />
    )
  },
)
Main.displayName = MAIN_NAME

/** Bottom tab bar below md (Pro C/Mobile nav). Children: MobileNavItem. */
export const MobileNav = forwardRef<HTMLElement, HTMLAttributes<HTMLElement>>(
  function AppShellMobileNav(
    { className, children, "aria-label": ariaLabel = "Primary", ...props },
    ref,
  ): ReactElement {
    return (
      <nav
        ref={ref}
        aria-label={ariaLabel}
        className={cn(
          "fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden",
          className,
        )}
        {...props}
      >
        <ul className="m-0 grid h-[60px] list-none auto-cols-fr grid-flow-col p-0">
          {children}
        </ul>
      </nav>
    )
  },
)
MobileNav.displayName = MOBILE_NAV_NAME

export const MobileNavItem = forwardRef<HTMLAnchorElement, NavItemProps>(
  function AppShellMobileNavItem(
    {
      label,
      icon,
      active = false,
      asChild = false,
      className,
      children,
      ...props
    },
    ref,
  ): ReactElement {
    const Comp = asChild ? Slot : "a"
    return (
      <li>
        <Comp
          ref={ref}
          aria-current={active ? "page" : undefined}
          className={cn(
            "flex h-full flex-col items-center justify-center gap-1 text-[11px]",
            active
              ? "font-600 text-ink [&_svg]:text-accent"
              : "font-500 text-secondary",
            className,
          )}
          {...props}
        >
          {icon ? (
            <span aria-hidden="true" className="flex items-center">
              {icon}
            </span>
          ) : null}
          <Slottable>{children}</Slottable>
          {label}
        </Comp>
      </li>
    )
  },
)
MobileNavItem.displayName = MOBILE_NAV_ITEM_NAME
