import * as ToastPrimitive from "@radix-ui/react-toast"
import { CircleAlert, CircleCheck, Info, X } from "lucide-react"
import {
  type ReactElement,
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react"
import { cn } from "./cn"

export type ToastTone = "success" | "error" | "neutral"

export type ToastAction = {
  label: string
  /** Screen-reader instruction for reaching the action another way. */
  altText: string
  onAction: () => void
}

export type ToastOptions = {
  title: string
  description?: string
  tone?: ToastTone
  /** Milliseconds; defaults to 2800 (Pro) or 6000 when there is an action. */
  duration?: number
  action?: ToastAction
}

type ToastRecord = ToastOptions & { id: number }

type ToastContextValue = {
  toast: (options: ToastOptions) => number
  dismiss: (id: number) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const toneIcon: Record<ToastTone, ReactElement> = {
  success: (
    <CircleCheck
      aria-hidden="true"
      size={16}
      strokeWidth={1.75}
      className="mt-px shrink-0 text-pos"
    />
  ),
  error: (
    <CircleAlert
      aria-hidden="true"
      size={16}
      strokeWidth={1.75}
      className="mt-px shrink-0 text-neg"
    />
  ),
  neutral: (
    <Info
      aria-hidden="true"
      size={16}
      strokeWidth={1.75}
      className="mt-px shrink-0 text-secondary"
    />
  ),
}

export type ProviderProps = {
  children: ReactNode
  /** Extra classes for the viewport, e.g. to clear a mobile tab bar. */
  viewportClassName?: string
}

/** Mount once near the app root; call `useToast()` anywhere below it. */
export function Provider({
  children,
  viewportClassName,
}: ProviderProps): ReactElement {
  const [toasts, setToasts] = useState<ToastRecord[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((item) => item.id !== id))
  }, [])

  const toast = useCallback((options: ToastOptions) => {
    const id = nextId.current
    nextId.current += 1
    setToasts((current) => [...current.slice(-2), { ...options, id }])
    return id
  }, [])

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss])

  return (
    <ToastContext.Provider value={value}>
      <ToastPrimitive.Provider swipeDirection="right" label="Notifications">
        {children}
        {toasts.map((item) => (
          <ToastItem key={item.id} item={item} onDismiss={dismiss} />
        ))}
        <ToastPrimitive.Viewport
          className={cn(
            "fixed bottom-6 right-6 z-[60] m-0 flex w-[360px] max-w-[calc(100vw-32px)] list-none flex-col gap-2 p-0 outline-none",
            viewportClassName,
          )}
        />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  )
}

function ToastItem({
  item,
  onDismiss,
}: {
  item: ToastRecord
  onDismiss: (id: number) => void
}): ReactElement {
  const tone = item.tone ?? "success"
  return (
    <ToastPrimitive.Root
      duration={item.duration ?? (item.action ? 6000 : 2800)}
      type={tone === "error" ? "foreground" : "background"}
      onOpenChange={(open) => {
        if (!open) onDismiss(item.id)
      }}
      className={cn(
        "flex items-start gap-2.5 rounded-lg border border-line-2 px-3.5 py-3 text-ink shadow-toast data-[state=open]:animate-sheet-in data-[swipe=cancel]:translate-x-0 data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[swipe=cancel]:transition-transform",
        tone === "success" ? "bg-accent-soft" : "bg-surface",
      )}
    >
      {toneIcon[tone]}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <ToastPrimitive.Title className="text-[13px] font-600 text-ink">
          {item.title}
        </ToastPrimitive.Title>
        {item.description ? (
          <ToastPrimitive.Description className="text-[12px] text-secondary">
            {item.description}
          </ToastPrimitive.Description>
        ) : null}
      </div>
      {item.action ? (
        <ToastPrimitive.Action
          altText={item.action.altText}
          onClick={item.action.onAction}
          className="h-7 shrink-0 rounded-md px-2.5 text-[12px] font-650 text-accent-ink transition-colors hover:bg-accent-soft-2"
        >
          {item.action.label}
        </ToastPrimitive.Action>
      ) : null}
      <ToastPrimitive.Close
        aria-label="Dismiss"
        className="-mr-1 flex size-6 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-inset hover:text-ink"
      >
        <X aria-hidden="true" size={14} strokeWidth={1.75} />
      </ToastPrimitive.Close>
    </ToastPrimitive.Root>
  )
}

export function useToast(): ToastContextValue {
  const value = useContext(ToastContext)
  if (!value) throw new Error("useToast must be used inside <Toast.Provider>")
  return value
}
