import { createContext, useContext } from "react"
import { type DocsCredentials, placeholderCredentials } from "./docs-snippets"

/** Credentials of the app/environment selected in the docs header. */
export const DocsContext = createContext<DocsCredentials>(
  placeholderCredentials("test"),
)

export function useDocsCredentials(): DocsCredentials {
  return useContext(DocsContext)
}
