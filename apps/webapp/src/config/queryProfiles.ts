export const QUERY_PROFILES = {
  REALTIME: {
    staleTime: 5_000,
    gcTime: 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
  },
  SHORT_CACHE: {
    staleTime: 30_000,
    gcTime: 300_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
  },
  LONG_CACHE: {
    staleTime: 120_000,
    gcTime: 600_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
  },
  STATIC_META: {
    staleTime: 600_000,
    gcTime: 1_800_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  },
} as const

export type QueryProfile = (typeof QUERY_PROFILES)[keyof typeof QUERY_PROFILES]
