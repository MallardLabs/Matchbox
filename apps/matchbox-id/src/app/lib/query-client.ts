import { QueryClient } from "@tanstack/react-query"

/** One query cache for the SPA (session, grants, consent, wallet hooks). */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
})
