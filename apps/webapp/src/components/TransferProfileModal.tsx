import type { GaugeProfile } from "@/config/supabase"
import {
  useCanTransferProfile,
  useTransferGaugeProfile,
} from "@/hooks/useGaugeProfiles"
import { Button, Modal, ModalBody, ModalHeader } from "@mezo-org/mezo-clay"
import { useCallback, useMemo, useState } from "react"
import type { Address } from "viem"
import { useAccount } from "wagmi"

type OwnedGauge = {
  tokenId: bigint
  gaugeAddress: Address
  profile: GaugeProfile | null
}

type TransferProfileModalProps = {
  isOpen: boolean
  onClose: () => void
  ownedGauges: OwnedGauge[]
  onTransferComplete?: () => void
}

// Calculate time remaining until next epoch
function formatTimeUntilNextEpoch(nextEpoch: number): string {
  const now = Math.floor(Date.now() / 1000)
  const remaining = nextEpoch - now

  if (remaining <= 0) return "now"

  const days = Math.floor(remaining / 86400)
  const hours = Math.floor((remaining % 86400) / 3600)
  const minutes = Math.floor((remaining % 3600) / 60)

  const parts: string[] = []
  if (days > 0) parts.push(`${days}d`)
  if (hours > 0) parts.push(`${hours}h`)
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`)

  return parts.join(" ")
}

function GaugeOption({
  gauge,
  isSelected,
  onSelect,
  disabled,
  label,
}: {
  gauge: OwnedGauge
  isSelected: boolean
  onSelect: () => void
  disabled?: boolean
  label?: string
}) {
  const hasProfile =
    gauge.profile?.display_name ||
    gauge.profile?.description ||
    gauge.profile?.profile_picture_url

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className={`flex w-full items-center gap-3 rounded-xl border p-4 text-left transition-all ${
        isSelected
          ? "border-[var(--accent)] bg-[rgba(var(--accent-rgb),0.1)]"
          : "border-[var(--border)] bg-[var(--surface-secondary)] hover:border-[var(--content-tertiary)]"
      } ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
    >
      {/* Profile Picture */}
      <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--border)] bg-[var(--surface)]">
        {gauge.profile?.profile_picture_url ? (
          <img
            src={gauge.profile.profile_picture_url}
            alt={`veBTC #${gauge.tokenId.toString()}`}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="text-xs text-[var(--content-secondary)]">
            #{gauge.tokenId.toString()}
          </span>
        )}
      </div>

      {/* Name and Info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className={`text-sm font-medium ${
              hasProfile
                ? "text-[var(--content-primary)]"
                : "text-[var(--content-secondary)]"
            }`}
          >
            {gauge.profile?.display_name ||
              `veBTC #${gauge.tokenId.toString()}`}
          </span>
          {gauge.profile?.display_name && (
            <span className="rounded bg-[rgba(247,147,26,0.15)] px-1.5 py-0.5 font-mono text-2xs text-[#F7931A]">
              #{gauge.tokenId.toString()}
            </span>
          )}
        </div>
        {gauge.profile?.description && (
          <p className="mt-0.5 truncate text-xs text-[var(--content-tertiary)]">
            {gauge.profile.description}
          </p>
        )}
        {!hasProfile && (
          <p className="mt-0.5 text-xs italic text-[var(--content-tertiary)]">
            No profile data
          </p>
        )}
        {label && (
          <span className="mt-1 inline-block rounded-full bg-[var(--surface)] px-2 py-0.5 text-2xs text-[var(--content-secondary)]">
            {label}
          </span>
        )}
      </div>

      {/* Selection indicator */}
      <div
        className={`h-5 w-5 flex-shrink-0 rounded-full border-2 ${
          isSelected
            ? "border-[var(--accent)] bg-[var(--accent)]"
            : "border-[var(--border)]"
        }`}
      >
        {isSelected && (
          <svg
            className="h-full w-full text-white"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
              clipRule="evenodd"
            />
          </svg>
        )}
      </div>
    </button>
  )
}

export function TransferProfileModal({
  isOpen,
  onClose,
  ownedGauges,
  onTransferComplete,
}: TransferProfileModalProps) {
  const { address } = useAccount()
  const [sourceGaugeAddress, setSourceGaugeAddress] = useState<Address | null>(
    null,
  )
  const [destGaugeAddress, setDestGaugeAddress] = useState<Address | null>(null)
  const [step, setStep] = useState<"source" | "destination" | "confirm">(
    "source",
  )
  const [transferError, setTransferError] = useState<string | null>(null)

  const {
    canTransfer,
    nextEpoch,
    isLoading: isLoadingCanTransfer,
  } = useCanTransferProfile(address)
  const { transferProfile, isLoading: isTransferring } =
    useTransferGaugeProfile()

  // Get source and destination gauge info
  const sourceGauge = useMemo(
    () => ownedGauges.find((g) => g.gaugeAddress === sourceGaugeAddress),
    [ownedGauges, sourceGaugeAddress],
  )
  const destGauge = useMemo(
    () => ownedGauges.find((g) => g.gaugeAddress === destGaugeAddress),
    [ownedGauges, destGaugeAddress],
  )

  // Filter gauges with profiles for source selection
  const gaugesWithProfiles = useMemo(
    () =>
      ownedGauges.filter(
        (g) =>
          g.profile?.display_name ||
          g.profile?.description ||
          g.profile?.profile_picture_url,
      ),
    [ownedGauges],
  )

  // Filter available destinations (exclude source)
  const availableDestinations = useMemo(
    () => ownedGauges.filter((g) => g.gaugeAddress !== sourceGaugeAddress),
    [ownedGauges, sourceGaugeAddress],
  )

  const handleClose = useCallback(() => {
    setSourceGaugeAddress(null)
    setDestGaugeAddress(null)
    setStep("source")
    setTransferError(null)
    onClose()
  }, [onClose])

  const handleSelectSource = useCallback((gaugeAddress: Address) => {
    setSourceGaugeAddress(gaugeAddress)
    setStep("destination")
  }, [])

  const handleSelectDestination = useCallback((gaugeAddress: Address) => {
    setDestGaugeAddress(gaugeAddress)
    setStep("confirm")
  }, [])

  const handleBack = useCallback(() => {
    if (step === "destination") {
      setSourceGaugeAddress(null)
      setStep("source")
    } else if (step === "confirm") {
      setDestGaugeAddress(null)
      setStep("destination")
    }
  }, [step])

  const handleTransfer = useCallback(async () => {
    if (
      !sourceGaugeAddress ||
      !destGaugeAddress ||
      !address ||
      !destGauge?.tokenId
    ) {
      return
    }

    setTransferError(null)

    const result = await transferProfile({
      fromGaugeAddress: sourceGaugeAddress,
      toGaugeAddress: destGaugeAddress,
      ownerAddress: address,
      toVeBTCTokenId: destGauge.tokenId,
    })

    if (result.success) {
      onTransferComplete?.()
      handleClose()
    } else {
      setTransferError(result.error || "Transfer failed")
    }
  }, [
    sourceGaugeAddress,
    destGaugeAddress,
    address,
    destGauge,
    transferProfile,
    onTransferComplete,
    handleClose,
  ])

  const renderContent = () => {
    // Check if user can transfer this epoch
    if (!canTransfer && !isLoadingCanTransfer) {
      return (
        <div className="py-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--warning-subtle)]">
            <span className="text-2xl">⏳</span>
          </div>
          <h3 className="mb-2 text-lg font-semibold text-[var(--content-primary)]">
            Transfer Limit Reached
          </h3>
          <p className="mb-4 text-sm text-[var(--content-secondary)]">
            You have already transferred a profile this epoch. You can transfer
            again in:
          </p>
          <div className="inline-block rounded-lg bg-[var(--surface-secondary)] px-4 py-2">
            <span className="font-mono text-lg font-semibold text-[var(--content-primary)]">
              {formatTimeUntilNextEpoch(nextEpoch)}
            </span>
          </div>
        </div>
      )
    }

    // Check if user has enough gauges
    if (ownedGauges.length < 2) {
      return (
        <div className="py-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--surface-secondary)]">
            <span className="text-2xl">🔒</span>
          </div>
          <h3 className="mb-2 text-lg font-semibold text-[var(--content-primary)]">
            Need More Gauges
          </h3>
          <p className="text-sm text-[var(--content-secondary)]">
            You need at least 2 gauges to transfer a profile between them.
          </p>
        </div>
      )
    }

    // Check if any gauges have profiles
    if (gaugesWithProfiles.length === 0) {
      return (
        <div className="py-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--surface-secondary)]">
            <span className="text-2xl">📝</span>
          </div>
          <h3 className="mb-2 text-lg font-semibold text-[var(--content-primary)]">
            No Profiles to Transfer
          </h3>
          <p className="text-sm text-[var(--content-secondary)]">
            None of your gauges have profile data to transfer. Set up a profile
            on one of your gauges first.
          </p>
        </div>
      )
    }

    // Step 1: Select source
    if (step === "source") {
      return (
        <div>
          <p className="mb-4 text-sm text-[var(--content-secondary)]">
            Select the gauge you want to transfer the profile{" "}
            <strong>from</strong>:
          </p>
          <div className="flex max-h-[400px] flex-col gap-3 overflow-y-auto">
            {gaugesWithProfiles.map((gauge) => (
              <GaugeOption
                key={gauge.gaugeAddress}
                gauge={gauge}
                isSelected={false}
                onSelect={() => handleSelectSource(gauge.gaugeAddress)}
                label="Has profile"
              />
            ))}
          </div>
        </div>
      )
    }

    // Step 2: Select destination
    if (step === "destination") {
      return (
        <div>
          <button
            type="button"
            onClick={handleBack}
            className="mb-4 flex items-center gap-1 text-sm text-[var(--accent)] hover:underline"
          >
            ← Back
          </button>
          <p className="mb-4 text-sm text-[var(--content-secondary)]">
            Select the gauge you want to transfer the profile{" "}
            <strong>to</strong>:
          </p>
          <div className="flex max-h-[400px] flex-col gap-3 overflow-y-auto">
            {availableDestinations.map((gauge) => (
              <GaugeOption
                key={gauge.gaugeAddress}
                gauge={gauge}
                isSelected={false}
                onSelect={() => handleSelectDestination(gauge.gaugeAddress)}
              />
            ))}
          </div>
        </div>
      )
    }

    // Step 3: Confirm
    if (step === "confirm" && sourceGauge && destGauge) {
      return (
        <div>
          <button
            type="button"
            onClick={handleBack}
            className="mb-4 flex items-center gap-1 text-sm text-[var(--accent)] hover:underline"
          >
            ← Back
          </button>

          <div className="mb-6 rounded-xl border border-[var(--border)] bg-[var(--surface-secondary)] p-4">
            <p className="mb-3 text-center text-sm text-[var(--content-secondary)]">
              Transfer profile from:
            </p>
            <div className="flex items-center justify-center gap-4">
              {/* Source */}
              <div className="flex flex-col items-center gap-2">
                <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border-2 border-[var(--border)] bg-[var(--surface)]">
                  {sourceGauge.profile?.profile_picture_url ? (
                    <img
                      src={sourceGauge.profile.profile_picture_url}
                      alt="Source"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-xs text-[var(--content-secondary)]">
                      #{sourceGauge.tokenId.toString()}
                    </span>
                  )}
                </div>
                <span className="max-w-[100px] truncate text-xs font-medium text-[var(--content-primary)]">
                  {sourceGauge.profile?.display_name ||
                    `#${sourceGauge.tokenId.toString()}`}
                </span>
              </div>

              {/* Arrow */}
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent)]">
                <span className="text-white">→</span>
              </div>

              {/* Destination */}
              <div className="flex flex-col items-center gap-2">
                <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-[var(--border)] bg-[var(--surface)]">
                  {destGauge.profile?.profile_picture_url ? (
                    <img
                      src={destGauge.profile.profile_picture_url}
                      alt="Destination"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-xs text-[var(--content-secondary)]">
                      #{destGauge.tokenId.toString()}
                    </span>
                  )}
                </div>
                <span className="max-w-[100px] truncate text-xs font-medium text-[var(--content-primary)]">
                  {destGauge.profile?.display_name ||
                    `#${destGauge.tokenId.toString()}`}
                </span>
              </div>
            </div>
          </div>

          <div className="mb-6 rounded-lg border border-[var(--warning-subtle)] bg-[var(--warning-subtle)] p-4">
            <p className="text-sm text-[var(--warning)]">
              <strong>Note:</strong> This will copy all profile data (name,
              description, picture, social links, strategies) to the destination
              gauge and clear the source gauge's profile. This action can only
              be done once per epoch.
            </p>
          </div>

          {transferError && (
            <div className="mb-4 rounded-lg border border-[var(--negative-subtle)] bg-[var(--negative-subtle)] p-3">
              <p className="text-sm text-[var(--negative)]">{transferError}</p>
            </div>
          )}

          <Button
            onClick={handleTransfer}
            kind="primary"
            isLoading={isTransferring}
            disabled={isTransferring}
            overrides={{ Root: { style: { width: "100%" } } }}
          >
            {isTransferring ? "Transferring..." : "Confirm Transfer"}
          </Button>
        </div>
      )
    }

    return null
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      overrides={{
        Dialog: {
          style: {
            maxWidth: "500px",
            width: "100%",
          },
        },
      }}
    >
      <ModalHeader>Transfer Gauge Profile</ModalHeader>
      <ModalBody>{renderContent()}</ModalBody>
    </Modal>
  )
}
