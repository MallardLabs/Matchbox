import { Slot, Slottable } from "@radix-ui/react-slot"
import { LoaderCircle } from "lucide-react"
import { type ButtonHTMLAttributes, type ReactElement, forwardRef } from "react"
import type { VariantProps } from "tailwind-variants"
import { tv } from "./cn"

const ROOT_NAME = "Button"

export const buttonStyles = tv({
  base: "inline-flex shrink-0 items-center justify-center whitespace-nowrap transition-[filter,background-color,border-color,color] disabled:pointer-events-none disabled:opacity-40 aria-disabled:pointer-events-none aria-disabled:opacity-40",
  variants: {
    variant: {
      primary:
        "bg-accent font-700 text-on-accent hover:brightness-95 active:brightness-90",
      secondary:
        "border border-line bg-surface font-600 text-ink hover:border-line-2 hover:bg-raised",
      ghost: "font-550 text-secondary hover:bg-inset hover:text-ink",
      danger: "bg-neg font-700 text-white hover:brightness-95",
      soft: "bg-accent-soft font-650 text-accent-ink hover:bg-accent-soft-2",
    },
    size: {
      sm: "h-7 gap-1.5 rounded-md px-2.5 text-[12px]",
      md: "h-[34px] gap-1.5 rounded-[7px] px-4 text-[12px]",
      lg: "h-10 gap-2 rounded-[7px] px-4 text-[13px]",
      "icon-sm": "size-7 rounded-md",
      "icon-md": "size-8 rounded-md",
    },
    loading: {
      true: "cursor-progress",
    },
  },
  defaultVariants: {
    variant: "primary",
    size: "md",
  },
})

export type ButtonVariant = NonNullable<
  VariantProps<typeof buttonStyles>["variant"]
>
export type ButtonSize = NonNullable<VariantProps<typeof buttonStyles>["size"]>

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Disables the button, sets aria-busy and shows a spinner before the label. */
  loading?: boolean
  asChild?: boolean
}

export const Root = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant,
    size,
    loading = false,
    asChild = false,
    className,
    disabled,
    type,
    children,
    ...props
  },
  ref,
): ReactElement {
  const Comp = asChild ? Slot : "button"
  const iconSize = size === "lg" ? 15 : 13
  return (
    <Comp
      ref={ref}
      className={buttonStyles({ variant, size, loading, className })}
      {...(asChild
        ? { "aria-disabled": disabled || loading ? true : undefined }
        : { type: type ?? "button", disabled: disabled || loading })}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <LoaderCircle
          aria-hidden="true"
          size={iconSize}
          strokeWidth={2}
          className="animate-spin"
        />
      ) : null}
      <Slottable>{children}</Slottable>
    </Comp>
  )
})
Root.displayName = ROOT_NAME
