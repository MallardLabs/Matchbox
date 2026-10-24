import { createFileRoute, redirect } from "@tanstack/react-router"

/** The app lands on Environments (no separate overview tab). */
export const Route = createFileRoute("/_app/apps/$appId/")({
  beforeLoad: ({ params, search }) => {
    throw redirect({
      to: "/apps/$appId/environments",
      params: { appId: params.appId },
      search,
      replace: true,
    })
  },
})
