import { type Token, useCustomToken, useTokenList } from "@/hooks/useTokenList"
import { Input, Select } from "@mezo-org/mezo-clay"
import { useEffect, useRef, useState } from "react"
import { type Address, isAddress } from "viem"

interface TokenSelectorProps {
  value: Token | undefined
  onChange: (token: Token | undefined) => void
  label?: string
  placeholder?: string
}

const CUSTOM_TOKEN_ID = "__custom__"

export function TokenSelector({
  value,
  onChange,
  label,
  placeholder = "Select a token",
}: TokenSelectorProps): JSX.Element {
  const { tokens: listTokens, isLoading: isLoadingList } = useTokenList()
  const [isCustomMode, setIsCustomMode] = useState(false)
  const [customAddress, setCustomAddress] = useState("")

  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const isValidCustomAddress = isAddress(customAddress)
  const { token: customToken, isLoading: isLoadingCustom } = useCustomToken(
    isValidCustomAddress ? (customAddress as Address) : undefined,
  )

  useEffect(() => {
    if (customToken && isCustomMode) {
      onChangeRef.current(customToken)
    }
  }, [customToken, isCustomMode])

  const options = [
    ...listTokens.map((token) => ({
      id: token.address,
      label: `${token.symbol} - ${token.name}`,
    })),
    { id: CUSTOM_TOKEN_ID, label: "Custom token..." },
  ]

  const handleSelectChange = (params: {
    value: readonly { id?: string | number }[]
  }) => {
    const selected = params.value[0]
    if (!selected?.id || typeof selected.id !== "string") {
      onChange(undefined)
      setIsCustomMode(false)
      return
    }

    if (selected.id === CUSTOM_TOKEN_ID) {
      setIsCustomMode(true)
      onChange(undefined)
      return
    }

    setIsCustomMode(false)
    const token = listTokens.find((t) => t.address === selected.id)
    onChange(token)
  }

  const handleCustomAddressChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const address = e.target.value
    setCustomAddress(address)
    if (!isAddress(address)) {
      onChange(undefined)
    }
  }

  const selectedValue = isCustomMode
    ? [{ id: CUSTOM_TOKEN_ID }]
    : value
      ? [{ id: value.address }]
      : []

  return (
    <div>
      {label && (
        <span className="mb-1 block text-xs text-[var(--content-secondary)]">
          {label}
        </span>
      )}
      <Select
        options={options}
        value={selectedValue}
        onChange={handleSelectChange}
        placeholder={isLoadingList ? "Loading tokens..." : placeholder}
        disabled={isLoadingList}
      />

      {isCustomMode && (
        <div className="mt-3">
          <span className="mb-1 block text-xs text-[var(--content-secondary)]">
            Token Address
          </span>
          <Input
            value={customAddress}
            onChange={handleCustomAddressChange}
            placeholder="0x..."
          />
          {customAddress && !isValidCustomAddress && (
            <p className="mt-2 text-sm text-[var(--negative)]">
              Invalid address
            </p>
          )}
          {isValidCustomAddress && isLoadingCustom && (
            <p className="mt-2 text-sm text-[var(--content-secondary)]">
              Loading token info...
            </p>
          )}
          {isValidCustomAddress && !isLoadingCustom && !customToken && (
            <p className="mt-2 text-sm text-[var(--negative)]">
              Could not load token info. Make sure this is a valid ERC20 token.
            </p>
          )}
          {customToken && (
            <p className="mt-2 text-sm text-[var(--positive)]">
              Found: {customToken.symbol} ({customToken.name})
            </p>
          )}
        </div>
      )}
    </div>
  )
}
