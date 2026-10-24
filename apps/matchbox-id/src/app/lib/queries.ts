import type {
  AuthorizationDecisionRequest,
  AuthorizationRequestSummary,
  AuthorizationRequestView,
  SessionListResponse,
} from "@repo/platform-contracts/identity"
import {
  type UseMutationResult,
  type UseQueryResult,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import type {
  GrantListViewResponse,
  SessionViewResponse,
} from "../../shared/contracts"
import { ApiError, api, isApiError } from "./api"

export const queryKeys = {
  session: ["session"],
  grants: ["grants"],
  sessions: ["sessions"],
  authorizationRequest: (id: string) => ["authorization-request", id],
  authorizationRequestSummary: (id: string) => [
    "authorization-request-summary",
    id,
  ],
} as const

function retryUnlessClientError(count: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status < 500) return false
  if (isApiError(error, "service_disabled")) return false
  return count < 2
}

export function useSession(): UseQueryResult<SessionViewResponse, ApiError> {
  return useQuery<SessionViewResponse, ApiError>({
    queryKey: queryKeys.session,
    queryFn: api.session,
    retry: retryUnlessClientError,
    staleTime: 30_000,
  })
}

export function useGrants(
  enabled: boolean,
): UseQueryResult<GrantListViewResponse, ApiError> {
  return useQuery<GrantListViewResponse, ApiError>({
    queryKey: queryKeys.grants,
    queryFn: api.grants,
    enabled,
    retry: retryUnlessClientError,
  })
}

export function useDeviceSessions(
  enabled: boolean,
): UseQueryResult<SessionListResponse, ApiError> {
  return useQuery<SessionListResponse, ApiError>({
    queryKey: queryKeys.sessions,
    queryFn: api.sessions,
    enabled,
    retry: retryUnlessClientError,
  })
}

export function useAuthorizationRequest(
  id: string,
  enabled: boolean,
): UseQueryResult<AuthorizationRequestView, ApiError> {
  return useQuery<AuthorizationRequestView, ApiError>({
    queryKey: queryKeys.authorizationRequest(id),
    queryFn: () => api.authorizationRequest(id),
    enabled: enabled && id.length > 0,
    retry: retryUnlessClientError,
    staleTime: Number.POSITIVE_INFINITY,
  })
}

/** The app behind an authorization request ("Continue to <app>"). */
export function useAuthorizationRequestSummary(
  id: string | null,
): UseQueryResult<AuthorizationRequestSummary, ApiError> {
  return useQuery<AuthorizationRequestSummary, ApiError>({
    queryKey: queryKeys.authorizationRequestSummary(id ?? ""),
    queryFn: () => api.authorizationRequestSummary(id ?? ""),
    enabled: id !== null,
    retry: retryUnlessClientError,
    staleTime: Number.POSITIVE_INFINITY,
  })
}

export function useSignOut(): UseMutationResult<unknown, ApiError, void> {
  const client = useQueryClient()
  return useMutation<unknown, ApiError, void>({
    mutationFn: api.signOut,
    onSuccess: () => {
      client.setQueryData<SessionViewResponse>(queryKeys.session, {
        account: null,
      })
      client.removeQueries({ queryKey: queryKeys.grants })
      client.removeQueries({ queryKey: queryKeys.sessions })
    },
  })
}

export function useRevokeGrant(): UseMutationResult<unknown, ApiError, string> {
  const client = useQueryClient()
  return useMutation<unknown, ApiError, string>({
    mutationFn: api.revokeGrant,
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.grants }),
  })
}

export function useRevokeSession(): UseMutationResult<
  unknown,
  ApiError,
  { id: string; current: boolean }
> {
  const client = useQueryClient()
  return useMutation<unknown, ApiError, { id: string; current: boolean }>({
    mutationFn: ({ id }) => api.revokeSession(id),
    onSuccess: (_data, { current }) => {
      if (current) {
        client.setQueryData<SessionViewResponse>(queryKeys.session, {
          account: null,
        })
      }
      return client.invalidateQueries({ queryKey: queryKeys.sessions })
    },
  })
}

export function useDecision(
  id: string,
): UseMutationResult<
  { redirectTo: string },
  ApiError,
  AuthorizationDecisionRequest
> {
  return useMutation<
    { redirectTo: string },
    ApiError,
    AuthorizationDecisionRequest
  >({
    mutationFn: (body) => api.decide(id, body),
  })
}
