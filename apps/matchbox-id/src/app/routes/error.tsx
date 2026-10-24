import { createFileRoute } from "@tanstack/react-router"
import type { ReactElement } from "react"
import { z } from "zod"
import ErrorState from "../components/ErrorState"

const searchSchema = z.object({
  code: z
    .string()
    .regex(/^[a-z_]{1,64}$/)
    .optional()
    .catch(undefined),
})

export const Route = createFileRoute("/error")({
  validateSearch: searchSchema,
  component: ErrorPage,
})

function ErrorPage(): ReactElement {
  const { code } = Route.useSearch()
  return <ErrorState code={code ?? "invalid_request"} />
}
