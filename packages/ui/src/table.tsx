import {
  type HTMLAttributes,
  type ReactElement,
  type TableHTMLAttributes,
  type TdHTMLAttributes,
  type ThHTMLAttributes,
  createContext,
  forwardRef,
  useContext,
} from "react"
import { cn, tv } from "./cn"

const ROOT_NAME = "Table"
const CAPTION_NAME = "TableCaption"
const HEADER_NAME = "TableHeader"
const BODY_NAME = "TableBody"
const ROW_NAME = "TableRow"
const HEAD_NAME = "TableHead"
const CELL_NAME = "TableCell"

export type TableDensity = "comfortable" | "compact"

const DensityContext = createContext<TableDensity>("comfortable")

export type RootProps = TableHTMLAttributes<HTMLTableElement> & {
  density?: TableDensity
  /** Class for the horizontal-scroll wrapper. */
  containerClassName?: string
}

/** Pro ledger table: divider rows, no zebra, no card chrome. */
export const Root = forwardRef<HTMLTableElement, RootProps>(function Table(
  { density = "comfortable", containerClassName, className, ...props },
  ref,
): ReactElement {
  return (
    <DensityContext.Provider value={density}>
      <div className={cn("min-w-0 overflow-x-auto", containerClassName)}>
        <table
          ref={ref}
          className={cn("w-full border-collapse text-left", className)}
          {...props}
        />
      </div>
    </DensityContext.Provider>
  )
})
Root.displayName = ROOT_NAME

export const Caption = forwardRef<
  HTMLTableCaptionElement,
  HTMLAttributes<HTMLTableCaptionElement>
>(function TableCaption({ className, ...props }, ref): ReactElement {
  return (
    <caption
      ref={ref}
      className={cn("pb-3 text-left text-[14px] font-600 text-ink", className)}
      {...props}
    />
  )
})
Caption.displayName = CAPTION_NAME

export const Header = forwardRef<
  HTMLTableSectionElement,
  HTMLAttributes<HTMLTableSectionElement>
>(function TableHeader(props, ref): ReactElement {
  return <thead ref={ref} {...props} />
})
Header.displayName = HEADER_NAME

export const Body = forwardRef<
  HTMLTableSectionElement,
  HTMLAttributes<HTMLTableSectionElement>
>(function TableBody(props, ref): ReactElement {
  return <tbody ref={ref} {...props} />
})
Body.displayName = BODY_NAME

export type RowProps = HTMLAttributes<HTMLTableRowElement> & {
  /** Hover tint for rows that open something. */
  interactive?: boolean
  selected?: boolean
}

export const Row = forwardRef<HTMLTableRowElement, RowProps>(function TableRow(
  { interactive = false, selected = false, className, ...props },
  ref,
): ReactElement {
  return (
    <tr
      ref={ref}
      aria-selected={selected || undefined}
      className={cn(
        "[tbody_&]:border-t [tbody_&]:border-line [tbody_&:last-child]:border-b",
        interactive && "cursor-pointer transition-colors hover:bg-raised",
        selected && "bg-accent-soft",
        className,
      )}
      {...props}
    />
  )
})
Row.displayName = ROW_NAME

const cellStyles = tv({
  base: "pr-3 align-middle last:pr-0",
  variants: {
    part: {
      head: "pb-2 text-[11px] font-500 text-secondary",
      cell: "text-[12px] text-ink",
    },
    density: {
      comfortable: "",
      compact: "",
    },
    numeric: {
      true: "text-right font-mono tabular-nums",
    },
    mono: {
      true: "font-mono",
    },
  },
  compoundVariants: [
    { part: "cell", density: "comfortable", class: "py-2.5" },
    { part: "cell", density: "compact", class: "py-1.5" },
    { part: "head", numeric: true, class: "font-sans" },
  ],
})

export type HeadProps = ThHTMLAttributes<HTMLTableCellElement> & {
  numeric?: boolean
}

export const Head = forwardRef<HTMLTableCellElement, HeadProps>(
  function TableHead(
    { numeric = false, scope = "col", className, ...props },
    ref,
  ): ReactElement {
    const density = useContext(DensityContext)
    return (
      <th
        ref={ref}
        scope={scope}
        className={cellStyles({ part: "head", density, numeric, className })}
        {...props}
      />
    )
  },
)
Head.displayName = HEAD_NAME

export type CellProps = TdHTMLAttributes<HTMLTableCellElement> & {
  /** Right-aligned mono tabular figures. */
  numeric?: boolean
  /** Mono for ids, keys, addresses. */
  mono?: boolean
}

export const Cell = forwardRef<HTMLTableCellElement, CellProps>(
  function TableCell(
    { numeric = false, mono = false, className, ...props },
    ref,
  ): ReactElement {
    const density = useContext(DensityContext)
    return (
      <td
        ref={ref}
        className={cellStyles({
          part: "cell",
          density,
          numeric,
          mono,
          className,
        })}
        {...props}
      />
    )
  },
)
Cell.displayName = CELL_NAME
