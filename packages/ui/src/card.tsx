import { Slot } from "@radix-ui/react-slot"
import {
  type HTMLAttributes,
  type ReactElement,
  createContext,
  forwardRef,
  useContext,
  useEffect,
  useId,
  useMemo,
  useState,
} from "react"
import { cn } from "./cn"

const ROOT_NAME = "Card"
const HEADER_NAME = "CardHeader"
const TITLE_NAME = "CardTitle"
const ACTIONS_NAME = "CardActions"
const BODY_NAME = "CardBody"
const FOOTER_NAME = "CardFooter"

/** flat: no chrome, divider-separated. panel: hairline frame on canvas. */
export type CardVariant = "flat" | "panel"

type CardContextValue = {
  variant: CardVariant
  titleId: string
  registerTitle: () => () => void
}

const CardContext = createContext<CardContextValue>({
  variant: "flat",
  titleId: "",
  registerTitle: () => () => {},
})

export type RootProps = HTMLAttributes<HTMLElement> & {
  variant?: CardVariant
}

export const Root = forwardRef<HTMLElement, RootProps>(function Card(
  { variant = "flat", className, ...props },
  ref,
): ReactElement {
  const titleId = useId()
  const [titled, setTitled] = useState(false)
  const value = useMemo<CardContextValue>(
    () => ({
      variant,
      titleId,
      registerTitle: () => {
        setTitled(true)
        return () => setTitled(false)
      },
    }),
    [titleId, variant],
  )
  return (
    <CardContext.Provider value={value}>
      <section
        ref={ref}
        aria-labelledby={titled ? titleId : undefined}
        className={cn(
          "flex min-w-0 flex-col",
          variant === "panel" && "rounded-[10px] border border-line bg-surface",
          className,
        )}
        {...props}
      />
    </CardContext.Provider>
  )
})
Root.displayName = ROOT_NAME

export const Header = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(function CardHeader({ className, ...props }, ref): ReactElement {
  const { variant } = useContext(CardContext)
  return (
    <div
      ref={ref}
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 pb-3",
        variant === "panel" && "px-4 pt-4",
        className,
      )}
      {...props}
    />
  )
})
Header.displayName = HEADER_NAME

export type TitleProps = HTMLAttributes<HTMLHeadingElement> & {
  /** Render a different heading level via a child element. */
  asChild?: boolean
}

export const Title = forwardRef<HTMLHeadingElement, TitleProps>(
  function CardTitle(
    { asChild = false, className, ...props },
    ref,
  ): ReactElement {
    const { titleId, registerTitle } = useContext(CardContext)
    useEffect(() => registerTitle(), [registerTitle])
    const Comp = asChild ? Slot : "h2"
    return (
      <Comp
        ref={ref}
        id={titleId === "" ? undefined : titleId}
        className={cn("text-[14px] font-600 text-ink", className)}
        {...props}
      />
    )
  },
)
Title.displayName = TITLE_NAME

export const Actions = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(function CardActions({ className, ...props }, ref): ReactElement {
  return (
    <div
      ref={ref}
      className={cn("flex items-center gap-2", className)}
      {...props}
    />
  )
})
Actions.displayName = ACTIONS_NAME

export const Body = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function CardBody({ className, ...props }, ref): ReactElement {
    const { variant } = useContext(CardContext)
    return (
      <div
        ref={ref}
        className={cn(
          "flex min-w-0 flex-col gap-3",
          variant === "panel" && "px-4 pb-4",
          className,
        )}
        {...props}
      />
    )
  },
)
Body.displayName = BODY_NAME

export const Footer = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(function CardFooter({ className, ...props }, ref): ReactElement {
  const { variant } = useContext(CardContext)
  return (
    <div
      ref={ref}
      className={cn(
        "flex flex-wrap items-center justify-end gap-2 border-t border-line pt-3",
        variant === "panel" ? "px-4 pb-3" : "mt-3",
        className,
      )}
      {...props}
    />
  )
})
Footer.displayName = FOOTER_NAME
