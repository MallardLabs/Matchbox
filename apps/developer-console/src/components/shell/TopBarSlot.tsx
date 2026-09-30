import {
  type ReactElement,
  type ReactNode,
  createContext,
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

export function TopBarSlotProvider({
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

/** Where route context (app name, environment) renders in the top bar. */
export function TopBarSlotTarget(): ReactElement {
  const { setTarget } = useContext(SlotContext)
  return <div ref={setTarget} className="flex min-w-0 items-center gap-2" />
}

/** Renders children into the top bar while mounted. */
export function TopBarContext({
  children,
}: {
  children: ReactNode
}): ReactElement | null {
  const { target } = useContext(SlotContext)
  return target === null ? null : createPortal(children, target)
}
