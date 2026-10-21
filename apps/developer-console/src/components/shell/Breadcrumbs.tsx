import { cn } from "@repo/ui/cn"
import {
  Children,
  Fragment,
  type ReactElement,
  type ReactNode,
  createContext,
  isValidElement,
  useContext,
  useState,
} from "react"
import { createPortal } from "react-dom"

type SlotValue = {
  target: HTMLElement | null
  setTarget: (element: HTMLElement | null) => void
}

const SlotContext = createContext<SlotValue>({
  target: null,
  setTarget: () => {},
})

export function BreadcrumbSlotProvider({
  children,
}: {
  children: ReactNode
}): ReactElement {
  const [target, setTarget] = useState<HTMLElement | null>(null)
  return (
    <SlotContext.Provider value={{ target, setTarget }}>
      {children}
    </SlotContext.Provider>
  )
}

/** Where the current page's breadcrumb renders in the top bar. */
export function BreadcrumbSlot(): ReactElement {
  const { setTarget } = useContext(SlotContext)
  return <div ref={setTarget} className="flex min-w-0 items-center" />
}

type CrumbProps = {
  /** The page itself: bold, aria-current, and the only crumb on phones. */
  current?: boolean
  children: ReactNode
}

/** One breadcrumb; wrap a router `<Link>` for parents. */
export function Crumb({ current = false, children }: CrumbProps): ReactElement {
  return (
    <li
      aria-current={current ? "page" : undefined}
      className={cn(
        "min-w-0 items-center truncate",
        current
          ? "flex text-body font-600 text-ink md:text-body-sm"
          : "hidden font-500 text-secondary md:flex [&_a:hover]:text-ink [&_a]:transition-colors",
      )}
    >
      {children}
    </li>
  )
}

/** Portals "Org / Section / Page" into the top bar while mounted. */
export function Crumbs({
  children,
}: {
  children: ReactNode
}): ReactElement | null {
  const { target } = useContext(SlotContext)
  if (target === null) return null
  const items = Children.toArray(children).filter(isValidElement)
  return createPortal(
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="m-0 flex min-w-0 list-none items-center gap-2.5 p-0 text-body-sm">
        {items.map((item, index) => (
          <Fragment key={item.key ?? index}>
            {index === 0 ? null : (
              <li
                aria-hidden="true"
                className="hidden shrink-0 text-faint md:block"
              >
                /
              </li>
            )}
            {item}
          </Fragment>
        ))}
      </ol>
    </nav>,
    target,
  )
}
