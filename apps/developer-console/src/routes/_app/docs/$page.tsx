import * as Button from "@repo/ui/button"
import * as EmptyState from "@repo/ui/empty-state"
import { Link, createFileRoute } from "@tanstack/react-router"
import type { ReactElement } from "react"
import { guides } from "../../../components/docs/guides"
import { docPages, isDocPageSlug } from "../../../lib/docs-pages"
import { useTitle } from "../../../lib/title"

export const Route = createFileRoute("/_app/docs/$page")({
  component: GuidePage,
})

function GuidePage(): ReactElement {
  const { page } = Route.useParams()
  const meta = docPages.find((item) => item.slug === page)
  useTitle(meta === undefined ? "Docs" : `${meta.title} · Docs`)
  if (!isDocPageSlug(page)) {
    return (
      <EmptyState.Root>
        <EmptyState.Title>Not found</EmptyState.Title>
        <EmptyState.Action>
          <Button.Root variant="secondary" asChild>
            <Link to="/docs">Quickstart</Link>
          </Button.Root>
        </EmptyState.Action>
      </EmptyState.Root>
    )
  }
  const Guide = guides[page]
  return <Guide />
}
