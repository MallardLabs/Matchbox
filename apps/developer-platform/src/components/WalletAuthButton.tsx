import { useMatchboxWalletBridge } from "@/hooks/useMatchboxWalletBridge"
import { useWalletIdentity } from "@/hooks/useWalletIdentity"
import { ConnectButton } from "@rainbow-me/rainbowkit"
import { useState } from "react"

type WalletAuthButtonProps = {
  onAuthenticated: () => Promise<void> | void
  inverse?: boolean
}

export function WalletAuthButton({
  onAuthenticated,
  inverse = true,
}: WalletAuthButtonProps): JSX.Element {
  const identity = useWalletIdentity()
  const bridge = useMatchboxWalletBridge()
  const [error, setError] = useState<string | null>(null)
  const [isSigning, setIsSigning] = useState(false)

  async function handleSignIn(): Promise<void> {
    setError(null)
    setIsSigning(true)
    try {
      if (identity.isConnected) await identity.signIn()
      else await bridge.signIn()
      await onAuthenticated()
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "The wallet signature was not accepted.",
      )
    } finally {
      setIsSigning(false)
    }
  }

  return (
    <div className="space-y-3">
      <iframe
        ref={bridge.frameRef}
        src={bridge.src}
        title="Matchbox connected wallet bridge"
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
      />
      <ConnectButton.Custom>
        {({
          account,
          chain,
          openAccountModal,
          openChainModal,
          openConnectModal,
          mounted,
        }) => {
          if (!mounted || !account) {
            if (bridge.isChecking) {
              return (
                <button
                  type="button"
                  className={
                    inverse
                      ? "secondary-button w-full"
                      : "light-secondary-button"
                  }
                  disabled
                >
                  Checking Matchbox wallet&hellip;
                </button>
              )
            }
            if (bridge.address) {
              return (
                <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                  <div
                    className={
                      inverse
                        ? "secondary-button min-w-0"
                        : "light-secondary-button min-w-0"
                    }
                  >
                    <span className="block truncate font-mono text-sm">
                      {`${bridge.address.slice(0, 6)}…${bridge.address.slice(-4)}`}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="primary-button"
                    disabled={isSigning}
                    onClick={handleSignIn}
                  >
                    {isSigning ? "Check wallet…" : "Continue"}
                  </button>
                </div>
              )
            }
            return (
              <button
                type="button"
                className={inverse ? "primary-button w-full" : "primary-button"}
                onClick={openConnectModal}
              >
                Connect wallet
              </button>
            )
          }
          if (chain?.unsupported) {
            return (
              <button
                type="button"
                className={inverse ? "primary-button w-full" : "primary-button"}
                onClick={openChainModal}
              >
                Switch network
              </button>
            )
          }
          return (
            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <button
                type="button"
                className={
                  inverse
                    ? "secondary-button min-w-0"
                    : "light-secondary-button min-w-0"
                }
                onClick={openAccountModal}
              >
                <span className="truncate font-mono text-sm">
                  {account.displayName}
                </span>
              </button>
              <button
                type="button"
                className={inverse ? "primary-button" : "primary-button"}
                disabled={isSigning}
                onClick={handleSignIn}
              >
                {isSigning ? "Check wallet…" : "Sign in"}
              </button>
            </div>
          )
        }}
      </ConnectButton.Custom>
      {error ? (
        <p
          className={inverse ? "text-sm text-red-300" : "text-sm text-red-700"}
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </div>
  )
}
