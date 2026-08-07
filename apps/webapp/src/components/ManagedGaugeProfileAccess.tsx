import { ClickableAddress } from "@/components/ClickableAddress"
import { ConnectWalletDrawer } from "@/components/ConnectWalletDrawer"
import { GaugeProfileEditor } from "@/components/GaugeProfileEditor"
import type { GaugeProfile } from "@/config/supabase"
import { useNetwork } from "@/contexts/NetworkContext"
import {
  managedGaugeEditorsEnabled,
  useGaugeProfileEditorStatus,
  useManageGaugeProfileEditor,
} from "@/hooks/useGaugeProfiles"
import { Button, Card, Input, Tag } from "@mezo-org/mezo-clay"
import { useMemo, useState } from "react"
import { type Address, getAddress, isAddress } from "viem"
import { useAccount, useChainId, useSwitchChain } from "wagmi"

type ManagedGaugeProfileAccessProps = {
  gaugeAddress: Address
  veBtcTokenId: bigint
  profile: GaugeProfile | null
  onProfileSaved: () => void
}

function normalizedAddress(value: string | undefined): Address | undefined {
  return value && isAddress(value) ? getAddress(value) : undefined
}

function controllerLabel(kind: string | undefined): string {
  switch (kind) {
    case "direct-eoa":
      return "Owner wallet"
    case "direct-contract":
      return "Contract wallet"
    case "ownable-eoa":
      return "Controller wallet"
    case "ownable-contract":
      return "Safe or contract controller"
    default:
      return "Controller"
  }
}

export function ManagedGaugeProfileAccess({
  gaugeAddress,
  veBtcTokenId,
  profile,
  onProfileSaved,
}: ManagedGaugeProfileAccessProps): JSX.Element | null {
  const { address, isConnected } = useAccount()
  const walletChainId = useChainId()
  const { chainId, networkName } = useNetwork()
  const { switchChainAsync, isPending: isSwitchingChain } = useSwitchChain()
  const status = useGaugeProfileEditorStatus(gaugeAddress, veBtcTokenId)
  const mutation = useManageGaugeProfileEditor(gaugeAddress, veBtcTokenId)
  const [editorInput, setEditorInput] = useState("")
  const [inputError, setInputError] = useState<string>()
  const [isEditingProfile, setIsEditingProfile] = useState(false)
  const [isConnectOpen, setIsConnectOpen] = useState(false)

  const controllerAddress = normalizedAddress(
    status.data?.controller.controllerAddress,
  )
  const editors = useMemo(
    () =>
      status.data?.editors.flatMap((editor) => {
        const editorAddress = normalizedAddress(editor.editor_address)
        return editorAddress ? [editorAddress] : []
      }) ?? [],
    [status.data?.editors],
  )
  const connectedAddress = normalizedAddress(address)
  const isController =
    connectedAddress !== undefined &&
    controllerAddress !== undefined &&
    connectedAddress.toLowerCase() === controllerAddress.toLowerCase()
  const isEditor =
    connectedAddress !== undefined &&
    editors.some(
      (editor) => editor.toLowerCase() === connectedAddress.toLowerCase(),
    )
  const canEditProfile = isController || isEditor
  const isCorrectNetwork = walletChainId === chainId

  if (!managedGaugeEditorsEnabled) return null
  if (!status.data || status.data.controller.controllerKind === "direct-eoa") {
    return null
  }

  async function grantEditor(): Promise<void> {
    const editorAddress = normalizedAddress(editorInput.trim())
    if (!editorAddress) {
      setInputError("Enter a valid 0x wallet address")
      return
    }
    if (editorAddress.toLowerCase() === controllerAddress?.toLowerCase()) {
      setInputError("The controller can already edit this profile")
      return
    }
    setInputError(undefined)
    const granted = await mutation.grantEditor(editorAddress)
    if (granted) setEditorInput("")
  }

  async function revokeEditor(editorAddress: Address): Promise<void> {
    setInputError(undefined)
    await mutation.revokeEditor(editorAddress)
  }

  async function switchToSelectedNetwork(): Promise<void> {
    await switchChainAsync({ chainId })
  }

  return (
    <Card withBorder overrides={{}}>
      <section aria-labelledby="gauge-profile-management-heading">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2
                id="gauge-profile-management-heading"
                className="text-lg font-semibold text-[var(--content-primary)]"
              >
                Profile management
              </h2>
              <p className="mt-1 max-w-2xl text-sm text-[var(--content-secondary)]">
                The on-chain controller can approve a wallet to update this
                gauge&apos;s Matchbox profile. This permission cannot move
                funds, vote, or submit transactions.
              </p>
            </div>
            <Tag color="blue" closeable={false}>
              Off-chain access only
            </Tag>
          </div>

          {status.error || !controllerAddress ? (
            <p role="alert" className="text-sm text-[var(--negative)]">
              Matchbox could not verify this gauge&apos;s current controller.
            </p>
          ) : (
            <>
              <dl className="grid gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] p-4 sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-[var(--content-secondary)]">
                    {controllerLabel(status.data?.controller.controllerKind)}
                  </dt>
                  <dd className="mt-1">
                    <ClickableAddress address={controllerAddress} />
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-[var(--content-secondary)]">
                    veBTC profile
                  </dt>
                  <dd className="mt-1 font-mono text-sm text-[var(--content-primary)]">
                    #{veBtcTokenId.toString()}
                  </dd>
                </div>
              </dl>

              {!isConnected ? (
                <div className="flex flex-col items-start gap-3">
                  <p className="text-sm text-[var(--content-secondary)]">
                    Connect the controller or an approved editor wallet to
                    continue.
                  </p>
                  <Button onClick={() => setIsConnectOpen(true)}>
                    Connect wallet
                  </Button>
                </div>
              ) : !isCorrectNetwork ? (
                <div className="flex flex-col items-start gap-3">
                  <p className="text-sm text-[var(--content-secondary)]">
                    Switch your wallet to {networkName} before signing.
                  </p>
                  <Button
                    onClick={() => void switchToSelectedNetwork()}
                    disabled={isSwitchingChain}
                  >
                    {isSwitchingChain
                      ? "Switching..."
                      : `Switch to ${networkName}`}
                  </Button>
                </div>
              ) : isController ? (
                <fieldset className="flex flex-col gap-3">
                  <legend className="text-sm font-semibold text-[var(--content-primary)]">
                    Approved editor wallet
                  </legend>
                  <p className="text-xs text-[var(--content-secondary)]">
                    If this controller is a Safe, connect the Safe itself. Its
                    normal threshold approval verifies the change.
                  </p>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                      id="managed-gauge-editor-address"
                      aria-label="Editor wallet address"
                      value={editorInput}
                      onChange={(event) => setEditorInput(event.target.value)}
                      placeholder="0x..."
                    />
                    <Button
                      onClick={() => void grantEditor()}
                      disabled={mutation.isLoading}
                    >
                      {mutation.isLoading
                        ? "Waiting for approval..."
                        : "Approve editor"}
                    </Button>
                  </div>
                  {inputError && (
                    <p role="alert" className="text-xs text-[var(--negative)]">
                      {inputError}
                    </p>
                  )}
                </fieldset>
              ) : !canEditProfile ? (
                <p className="text-sm text-[var(--content-secondary)]">
                  This wallet is not approved. Connect the controller shown
                  above to approve it.
                </p>
              ) : null}

              {editors.length > 0 && (
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-[var(--content-primary)]">
                    Active editors
                  </h3>
                  <ol className="flex flex-col gap-2">
                    {editors.map((editor) => (
                      <li
                        key={editor}
                        className="flex flex-col gap-2 rounded-lg border border-[var(--border)] p-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <ClickableAddress address={editor} />
                        {isController && (
                          <Button
                            kind="secondary"
                            size="small"
                            onClick={() => void revokeEditor(editor)}
                            disabled={mutation.isLoading}
                          >
                            Revoke
                          </Button>
                        )}
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {mutation.error && (
                <p role="alert" className="text-xs text-[var(--negative)]">
                  {mutation.error.message}
                </p>
              )}

              {canEditProfile && connectedAddress && (
                <div className="border-t border-[var(--border)] pt-4">
                  {isEditingProfile ? (
                    <GaugeProfileEditor
                      gaugeAddress={gaugeAddress}
                      veBtcTokenId={veBtcTokenId}
                      signerAddress={connectedAddress}
                      profile={profile}
                      onCancel={() => setIsEditingProfile(false)}
                      onSaved={() => {
                        setIsEditingProfile(false)
                        onProfileSaved()
                      }}
                    />
                  ) : (
                    <Button onClick={() => setIsEditingProfile(true)}>
                      Edit gauge profile
                    </Button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </section>
      <ConnectWalletDrawer
        isOpen={isConnectOpen}
        onClose={() => setIsConnectOpen(false)}
      />
    </Card>
  )
}
