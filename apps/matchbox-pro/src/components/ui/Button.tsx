import { cn } from "@/lib/cn"
import { type ButtonHTMLAttributes, type ReactElement, forwardRef } from "react"

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "danger"
  | "soft"
export type ButtonSize = "sm" | "md" | "lg"

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
}

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-on-accent font-700 hover:brightness-95 active:brightness-90",
  secondary:
    "border border-line bg-surface text-ink font-600 hover:border-line-2 hover:bg-raised",
  ghost: "text-secondary font-550 hover:bg-inset hover:text-ink",
  danger: "bg-neg text-white font-700 hover:brightness-95",
  soft: "bg-accent-soft text-accent-ink font-650 hover:bg-accent-soft-2",
}

const sizes: Record<ButtonSize, string> = {
  sm: "h-7 rounded-md px-2.5 text-[12px] gap-1.5",
  md: "h-[34px] rounded-[7px] px-4 text-[12px] gap-1.5",
  lg: "h-10 rounded-[7px] px-4 text-[13px] gap-2",
}

/** Button primitive matching the Pen C/Button components. */
const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", className, type = "button", ...props },
  ref,
): ReactElement {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex shrink-0 items-center justify-center whitespace-nowrap transition-[filter,background-color,border-color,color] disabled:pointer-events-none disabled:opacity-40",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  )
})

export default Button
