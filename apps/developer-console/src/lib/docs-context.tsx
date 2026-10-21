import type { App } from "@repo/platform-contracts/console"
import type { EnvironmentKind } from "@repo/platform-contracts/network"
import { createContext, useContext } from "react"
import { type DocsCredentials, placeholderCredentials } from "./docs-snippets"

/** Credentials of the app/environment selected in the docs header. */
export const DocsContext = createContext<DocsCredentials>(
  placeholderCredentials("test"),
)

export function useDocsCredentials(): DocsCredentials {
  return useContext(DocsContext)
}

export type DocsControls = {
  kind: EnvironmentKind
  setKind: (kind: EnvironmentKind) => void
  /** The org's apps when signed in; null on public docs. */
  apps: App[] | null
  appId: string | null
  setApp: (appId: string) => void
}

/** Environment + app pickers shared by every docs page header. */
export const DocsControlsContext = createContext<DocsControls>({
  kind: "test",
  setKind: () => {},
  apps: null,
  appId: null,
  setApp: () => {},
})

export function useDocsControls(): DocsControls {
  return useContext(DocsControlsContext)
}
