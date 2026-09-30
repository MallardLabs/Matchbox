import { Slot } from "@radix-ui/react-slot"
import {
  type HTMLAttributes,
  type LabelHTMLAttributes,
  type ReactElement,
  type ReactNode,
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useState,
} from "react"
import { cn } from "./cn"
import { FieldListContext } from "./fieldset"

const ROOT_NAME = "Field"
const LABEL_NAME = "FieldLabel"
const CONTROL_NAME = "FieldControl"
const DESCRIPTION_NAME = "FieldDescription"
const ERROR_NAME = "FieldError"

export type FieldOrientation = "vertical" | "horizontal"
type Part = "description" | "error"

type FieldContextValue = {
  controlId: string
  descriptionId: string
  errorId: string
  parts: Record<Part, boolean>
  invalid: boolean
  required: boolean
  disabled: boolean
  orientation: FieldOrientation
  register: (part: Part) => () => void
}

const FieldContext = createContext<FieldContextValue | null>(null)

function useField(name: string): FieldContextValue {
  const value = useContext(FieldContext)
  if (!value) throw new Error(`<${name}> must be used inside <Field.Root>`)
  return value
}

export type RootProps = HTMLAttributes<HTMLElement> & {
  /** Marks the control invalid even without a `Field.Error` message. */
  invalid?: boolean
  required?: boolean
  disabled?: boolean
  orientation?: FieldOrientation
  /** Id given to the control; generated when omitted. */
  controlId?: string
}

export const Root = forwardRef<HTMLElement, RootProps>(function Field(
  {
    invalid = false,
    required = false,
    disabled = false,
    orientation = "vertical",
    controlId,
    className,
    children,
    ...props
  },
  ref,
): ReactElement {
  const inList = useContext(FieldListContext)
  const baseId = useId()
  const [parts, setParts] = useState<Record<Part, boolean>>({
    description: false,
    error: false,
  })

  const register = useCallback((part: Part) => {
    setParts((current) => ({ ...current, [part]: true }))
    return () => setParts((current) => ({ ...current, [part]: false }))
  }, [])

  const value = useMemo<FieldContextValue>(
    () => ({
      controlId: controlId ?? `${baseId}-control`,
      descriptionId: `${baseId}-description`,
      errorId: `${baseId}-error`,
      parts,
      invalid: invalid || parts.error,
      required,
      disabled,
      orientation,
      register,
    }),
    [
      baseId,
      controlId,
      disabled,
      invalid,
      orientation,
      parts,
      register,
      required,
    ],
  )

  const Comp = inList ? "li" : "div"
  return (
    <FieldContext.Provider value={value}>
      <Slot
        ref={ref}
        data-invalid={value.invalid || undefined}
        data-disabled={disabled || undefined}
        className={cn(
          orientation === "vertical"
            ? "flex min-w-0 flex-col gap-1.5"
            : "grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2.5 gap-y-0.5",
          className,
        )}
        {...props}
      >
        <Comp>{children}</Comp>
      </Slot>
    </FieldContext.Provider>
  )
})
Root.displayName = ROOT_NAME

export const Label = forwardRef<
  HTMLLabelElement,
  LabelHTMLAttributes<HTMLLabelElement>
>(function FieldLabel({ className, children, ...props }, ref): ReactElement {
  const field = useField(LABEL_NAME)
  return (
    <label
      ref={ref}
      htmlFor={field.controlId}
      className={cn(
        "text-[12px] font-600 text-ink-2",
        field.orientation === "horizontal" && "text-[13px] font-500 text-ink",
        field.disabled && "opacity-50",
        className,
      )}
      {...props}
    >
      {children}
    </label>
  )
})
Label.displayName = LABEL_NAME

export type ControlProps = HTMLAttributes<HTMLElement> & {
  children: ReactNode
}

/** Wires id, aria-describedby, aria-invalid and aria-required onto its only child. */
export const Control = forwardRef<HTMLElement, ControlProps>(
  function FieldControl({ children, ...props }, ref): ReactElement {
    const field = useField(CONTROL_NAME)
    const describedBy = [
      field.parts.description ? field.descriptionId : null,
      field.parts.error ? field.errorId : null,
    ]
      .filter(Boolean)
      .join(" ")
    return (
      <Slot
        ref={ref}
        id={field.controlId}
        aria-describedby={describedBy === "" ? undefined : describedBy}
        aria-invalid={field.invalid || undefined}
        aria-required={field.required || undefined}
        {...(field.disabled ? { disabled: true } : {})}
        {...props}
      >
        {children}
      </Slot>
    )
  },
)
Control.displayName = CONTROL_NAME

export const Description = forwardRef<
  HTMLParagraphElement,
  HTMLAttributes<HTMLParagraphElement>
>(function FieldDescription({ className, ...props }, ref): ReactElement {
  const field = useField(DESCRIPTION_NAME)
  const { register } = field
  useEffect(() => register("description"), [register])
  return (
    <p
      ref={ref}
      id={field.descriptionId}
      className={cn(
        "text-[12px] text-secondary",
        field.orientation === "horizontal" && "col-start-2",
        className,
      )}
      {...props}
    />
  )
})
Description.displayName = DESCRIPTION_NAME

/** Renders nothing without children, so it can stay mounted. */
const FieldError = forwardRef<
  HTMLParagraphElement,
  HTMLAttributes<HTMLParagraphElement>
>(function FieldError({ children, ...props }, ref): ReactElement | null {
  const hasMessage =
    children !== null &&
    children !== undefined &&
    children !== false &&
    children !== ""
  return hasMessage ? (
    <ErrorMessage ref={ref} {...props}>
      {children}
    </ErrorMessage>
  ) : null
})
FieldError.displayName = ERROR_NAME

export { FieldError as Error }

const ErrorMessage = forwardRef<
  HTMLParagraphElement,
  HTMLAttributes<HTMLParagraphElement>
>(function FieldErrorMessage({ className, ...props }, ref): ReactElement {
  const field = useField(ERROR_NAME)
  const { register } = field
  useEffect(() => register("error"), [register])
  return (
    <p
      ref={ref}
      id={field.errorId}
      className={cn(
        "text-[12px] font-500 text-neg",
        field.orientation === "horizontal" && "col-start-2",
        className,
      )}
      {...props}
    />
  )
})
