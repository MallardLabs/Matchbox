import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react"

type AcademyContextValue = {
  enabled: boolean
  toggle: () => void
  setEnabled: (enabled: boolean) => void
}

const AcademyContext = createContext<AcademyContextValue | null>(null)

export function useAcademy(): AcademyContextValue {
  const ctx = useContext(AcademyContext)
  if (!ctx) {
    throw new Error("useAcademy must be used within an <AcademyProvider>")
  }
  return ctx
}

export function AcademyProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(false)
  const toggle = useCallback(() => setEnabled((prev) => !prev), [])

  const value = useMemo<AcademyContextValue>(
    () => ({ enabled, toggle, setEnabled }),
    [enabled, toggle],
  )

  return (
    <AcademyContext.Provider value={value}>{children}</AcademyContext.Provider>
  )
}
