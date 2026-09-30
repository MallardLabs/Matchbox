import {
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactElement,
  createContext,
  forwardRef,
  useContext,
} from "react"
import type { VariantProps } from "tailwind-variants"
import { cn, tv } from "./cn"

const ROOT_NAME = "Input"
const GROUP_NAME = "InputGroup"
const ADORNMENT_NAME = "InputAdornment"

/** Shared frame for text-like controls (input, textarea, select trigger). */
export const controlStyles = tv({
  base: "w-full min-w-0 rounded-[7px] border border-line bg-inset font-500 text-ink transition-colors placeholder:text-muted hover:border-line-2 focus-visible:border-line-2 disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-neg",
  variants: {
    size: {
      sm: "h-8 px-2.5 text-[12px]",
      md: "h-[34px] px-2.5 text-[13px]",
      lg: "h-10 px-3 text-[14px]",
    },
    mono: {
      true: "font-mono font-400",
    },
  },
  defaultVariants: { size: "md" },
})

export type ControlSize = NonNullable<
  VariantProps<typeof controlStyles>["size"]
>

const groupStyles = tv({
  base: "flex w-full min-w-0 items-center gap-2 rounded-[7px] border border-line bg-inset text-muted transition-colors focus-within:border-line-2 hover:border-line-2 has-[[aria-invalid=true]]:border-neg has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent-ink",
  variants: {
    size: {
      sm: "h-8 px-2.5 text-[12px]",
      md: "h-[34px] px-2.5 text-[13px]",
      lg: "h-10 px-3 text-[14px]",
    },
  },
  defaultVariants: { size: "md" },
})

const GroupContext = createContext(false)

export type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "size"> & {
  size?: ControlSize
  mono?: boolean
}

export const Root = forwardRef<HTMLInputElement, InputProps>(function Input(
  { size, mono = false, className, type = "text", ...props },
  ref,
): ReactElement {
  const grouped = useContext(GroupContext)
  return (
    <input
      ref={ref}
      type={type}
      className={
        grouped
          ? controlStyles({
              mono,
              className: [
                "h-full flex-1 border-0 bg-transparent px-0 hover:border-0 focus-visible:outline-none",
                className,
              ],
            })
          : controlStyles({ size, mono, className })
      }
      {...props}
    />
  )
})
Root.displayName = ROOT_NAME

export type GroupProps = HTMLAttributes<HTMLDivElement> & {
  size?: ControlSize
}

/** Frame for an input with leading/trailing adornments (icons, units, kbd). */
export const Group = forwardRef<HTMLDivElement, GroupProps>(function InputGroup(
  { size, className, children, ...props },
  ref,
): ReactElement {
  return (
    <GroupContext.Provider value={true}>
      <div ref={ref} className={groupStyles({ size, className })} {...props}>
        {children}
      </div>
    </GroupContext.Provider>
  )
})
Group.displayName = GROUP_NAME

export const Adornment = forwardRef<
  HTMLSpanElement,
  HTMLAttributes<HTMLSpanElement>
>(function InputAdornment({ className, ...props }, ref): ReactElement {
  return (
    <span
      ref={ref}
      className={cn("flex shrink-0 items-center text-muted", className)}
      {...props}
    />
  )
})
Adornment.displayName = ADORNMENT_NAME
