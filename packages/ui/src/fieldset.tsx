import {
  type FieldsetHTMLAttributes,
  type HTMLAttributes,
  type OlHTMLAttributes,
  type ReactElement,
  createContext,
  forwardRef,
} from "react"
import { cn } from "./cn"

const ROOT_NAME = "Fieldset"
const LEGEND_NAME = "FieldsetLegend"
const DESCRIPTION_NAME = "FieldsetDescription"
const FIELDS_NAME = "FieldsetFields"

/** True inside `Fieldset.Fields`; `Field.Root` then renders an `<li>`. */
export const FieldListContext = createContext(false)

export const Root = forwardRef<
  HTMLFieldSetElement,
  FieldsetHTMLAttributes<HTMLFieldSetElement>
>(function Fieldset({ className, ...props }, ref): ReactElement {
  return (
    <fieldset
      ref={ref}
      className={cn(
        "m-0 flex min-w-0 flex-col gap-4 border-0 p-0 disabled:opacity-60",
        className,
      )}
      {...props}
    />
  )
})
Root.displayName = ROOT_NAME

export type LegendProps = HTMLAttributes<HTMLLegendElement> & {
  /** Visually hide the legend while keeping it as the group's accessible name. */
  hidden?: boolean
}

export const Legend = forwardRef<HTMLLegendElement, LegendProps>(
  function FieldsetLegend(
    { hidden = false, className, ...props },
    ref,
  ): ReactElement {
    return (
      <legend
        ref={ref}
        className={cn(
          hidden
            ? "sr-only"
            : "float-left w-full p-0 text-[14px] font-600 text-ink",
          className,
        )}
        {...props}
      />
    )
  },
)
Legend.displayName = LEGEND_NAME

export const Description = forwardRef<
  HTMLParagraphElement,
  HTMLAttributes<HTMLParagraphElement>
>(function FieldsetDescription({ className, ...props }, ref): ReactElement {
  return (
    <p
      ref={ref}
      className={cn("-mt-2 text-[12px] text-secondary", className)}
      {...props}
    />
  )
})
Description.displayName = DESCRIPTION_NAME

/** Ordered list of `Field.Root`s; list semantics only, no list styling. */
export const Fields = forwardRef<
  HTMLOListElement,
  OlHTMLAttributes<HTMLOListElement>
>(function FieldsetFields({ className, ...props }, ref): ReactElement {
  return (
    <FieldListContext.Provider value={true}>
      <ol
        ref={ref}
        className={cn("m-0 flex list-none flex-col gap-4 p-0", className)}
        {...props}
      />
    </FieldListContext.Provider>
  )
})
Fields.displayName = FIELDS_NAME
