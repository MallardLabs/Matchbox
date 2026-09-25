export const QUERY_PROFILES = {
  SHORT_CACHE: {
    staleTime: 30_000,
    gcTime: 300_000,
  },
  LONG_CACHE: {
    staleTime: 120_000,
    gcTime: 600_000,
  },
} as const
