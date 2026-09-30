import {
  type HTMLAttributes,
  type ReactElement,
  createContext,
  forwardRef,
  useContext,
} from "react"
import { cn } from "./cn"

const ROOT_NAME = "KeyValue"
const ITEM_NAME = "KeyValueItem"
const TERM_NAME = "KeyValueTerm"
const VALUE_NAME = "KeyValueValue"

export type KeyValueLayout = "rows" | "stacked"

const LayoutContext = createContext<KeyValueLayout>("rows")

export type RootProps = HTMLAttributes<HTMLDListElement> & {
  /** rows: term left, value right, divided. stacked: term above value, in a grid. */
  layout?: KeyValueLayout
}

export const Root = forwardRef<HTMLDListElement, RootProps>(function KeyValue(
  { layout = "rows", className, ...props },
  ref,
): ReactElement {
  return (
    <LayoutContext.Provider value={layout}>
      <dl
        ref={ref}
        className={cn(
          "m-0",
          layout === "rows"
            ? "flex flex-col"
            : "grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-x-6 gap-y-4",
          className,
        )}
        {...props}
      />
    </LayoutContext.Provider>
  )
})
Root.displayName = ROOT_NAME

export const Item = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function KeyValueItem({ className, ...props }, ref): ReactElement {
    const layout = useContext(LayoutContext)
    return (
      <div
        ref={ref}
        className={cn(
          layout === "rows"
            ? "flex items-baseline justify-between gap-4 border-t border-line py-2.5 last:border-b"
            : "flex min-w-0 flex-col gap-1",
          className,
        )}
        {...props}
      />
    )
  },
)
Item.displayName = ITEM_NAME

export const Term = forwardRef<HTMLElement, HTMLAttributes<HTMLElement>>(
  function KeyValueTerm({ className, ...props }, ref): ReactElement {
    return (
      <dt
        ref={ref}
        className={cn(
          "shrink-0 text-[12px] font-500 text-secondary",
          className,
        )}
        {...props}
      />
    )
  },
)
Term.displayName = TERM_NAME

export type ValueProps = HTMLAttributes<HTMLElement> & {
  mono?: boolean
}

/** Renders an em dash when empty. */
export const Value = forwardRef<HTMLElement, ValueProps>(function KeyValueValue(
  { mono = false, className, children, ...props },
  ref,
): ReactElement {
  const layout = useContext(LayoutContext)
  const empty =
    children === null ||
    children === undefined ||
    children === false ||
    children === ""
  return (
    <dd
      ref={ref}
      className={cn(
        "m-0 min-w-0 text-[13px] font-500 text-ink",
        layout === "rows" && "text-right",
        mono && "font-mono font-400",
        empty && "text-secondary",
        className,
      )}
      {...props}
    >
      {empty ? "—" : children}
    </dd>
  )
})
Value.displayName = VALUE_NAME
