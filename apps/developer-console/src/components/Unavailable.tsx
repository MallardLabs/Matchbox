import * as Logo from "@repo/ui/logo"
import type { ReactElement } from "react"
import { useTitle } from "../lib/title"

/** Kill switch (`service_disabled`) state. */
export default function Unavailable(): ReactElement {
  useTitle("Unavailable")
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-canvas px-4 text-center">
      <Logo.Root />
      <h1 className="text-[18px] font-600 text-ink">
        Developer console unavailable
      </h1>
    </main>
  )
}
