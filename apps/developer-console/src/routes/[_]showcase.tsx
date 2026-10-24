import * as EmptyState from "@repo/ui/empty-state"
import { Showcase } from "@repo/ui/showcase"
import { createFileRoute } from "@tanstack/react-router"
import type { ReactElement } from "react"
import { useTitle } from "../lib/title"

export const Route = createFileRoute("/_showcase")({
  component: ShowcasePage,
})

function ShowcasePage(): ReactElement {
  useTitle("Showcase")
  if (!import.meta.env.DEV) {
    return (
      <EmptyState.Root layout="centered">
        <EmptyState.Title>Not found</EmptyState.Title>
      </EmptyState.Root>
    )
  }
  return <Showcase />
}
