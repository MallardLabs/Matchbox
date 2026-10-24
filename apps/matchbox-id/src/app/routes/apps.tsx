import { createFileRoute, redirect } from "@tanstack/react-router"

/** Older links: connected apps now live on the account page. */
export const Route = createFileRoute("/apps")({
  beforeLoad: () => {
    throw redirect({ to: "/", replace: true })
  },
})
