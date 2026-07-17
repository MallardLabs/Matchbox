import { QUERY_PROFILES } from "@/config/queryProfiles"
import { useNetwork } from "@/contexts/NetworkContext"
import { type Validator, validatorsResponseSchema } from "@/lib/validators"
import { CHAIN_ID } from "@repo/shared/contracts"
import { useQuery } from "@tanstack/react-query"
import { useMemo } from "react"

async function fetchValidators(chainId: number) {
  const network = chainId === CHAIN_ID.testnet ? "testnet" : "mainnet"
  const response = await fetch(`/api/validators/${network}`, {
    cache: "no-store",
  })
  if (!response.ok) {
    throw new Error(`Unable to load validators (${response.status})`)
  }
  return validatorsResponseSchema.parse(await response.json())
}

export default function useValidators() {
  const { chainId, isNetworkReady } = useNetwork()
  const query = useQuery({
    queryKey: ["validators", chainId],
    queryFn: () => fetchValidators(chainId),
    enabled: isNetworkReady,
    ...QUERY_PROFILES.SHORT_CACHE,
  })

  const validators = query.data?.data ?? []
  const votableValidators = useMemo(
    () =>
      validators.filter(
        (validator) =>
          validator.isAlive &&
          validator.gauge !== "0x0000000000000000000000000000000000000000",
      ),
    [validators],
  )

  return {
    validators,
    votableValidators,
    totalWeight: BigInt(query.data?.totalWeight ?? "0"),
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  }
}

export function useValidatorByGauge(gaugeAddress: string | undefined): {
  validator: Validator | undefined
  isLoading: boolean
  error: Error | null
  refetch: () => Promise<unknown>
  totalWeight: bigint
} {
  const state = useValidators()
  const validator = state.validators.find(
    (entry) => entry.gauge.toLowerCase() === gaugeAddress?.toLowerCase(),
  )
  return {
    validator,
    isLoading: state.isLoading,
    error: state.error,
    refetch: state.refetch,
    totalWeight: state.totalWeight,
  }
}
