import * as Button from "@repo/ui/button"
import * as Dialog from "@repo/ui/dialog"
import * as WalletAddress from "@repo/ui/wallet-address"
import { ArrowLeft, ArrowRight } from "lucide-react"
import { type ReactElement, type ReactNode, useState } from "react"
import { type Connector, useAccount, useConnect, useDisconnect } from "wagmi"
import { isUserRejection } from "../../lib/wallet-errors"
import NetworkLabel from "../NetworkLabel"

type ConnectModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const TERMS_URL = "https://mezo.org/legal/terms"
const PRIVACY_URL = "https://mezo.org/legal/privacy"

/** Matchbox Pro's wallet picker (wagmi connectors from the RainbowKit list). */
export default function ConnectModal({
  open,
  onOpenChange,
}: ConnectModalProps): ReactElement {
  const { connectors, connect, error, reset } = useConnect()
  const { address, chainId, isConnected } = useAccount()
  const { disconnect } = useDisconnect()
  const [pending, setPending] = useState<Connector | null>(null)

  const visible = connectors.filter(
    (connector, index, list) =>
      list.findIndex((item) => item.id === connector.id) === index,
  )

  function choose(connector: Connector): void {
    setPending(connector)
    connect(
      { connector },
      {
        onSuccess: () => onOpenChange(false),
        onSettled: () => setPending(null),
      },
    )
  }

  function chooseAgain(): void {
    reset()
    setPending(null)
  }

  let body: ReactNode
  if (isConnected && address !== undefined) {
    body = (
      <>
        <Dialog.Title>Connected</Dialog.Title>
        <WalletAddress.Root address={address} className="text-[16px]" />
        <p className="flex items-center justify-between gap-3 rounded-lg bg-inset px-3 py-2.5 text-[13px] text-secondary">
          Network
          <NetworkLabel chainId={chainId} />
        </p>
        <Button.Root
          variant="secondary"
          size="lg"
          className="w-full"
          onClick={() => {
            disconnect()
            onOpenChange(false)
          }}
        >
          Disconnect
        </Button.Root>
      </>
    )
  } else if (pending !== null) {
    body = (
      <>
        <Dialog.Title>{pending.name}</Dialog.Title>
        <output className="flex h-[72px] items-center justify-center text-[14px] font-500 text-accent-ink">
          Connecting…
        </output>
        <button
          type="button"
          onClick={chooseAgain}
          className="flex items-center gap-1.5 self-start text-[12px] font-500 text-secondary transition-colors hover:text-ink"
        >
          <ArrowLeft size={13} strokeWidth={1.75} aria-hidden="true" />
          Back
        </button>
      </>
    )
  } else {
    body = (
      <>
        <Dialog.Title>Connect wallet</Dialog.Title>
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {visible.map((connector) => (
            <li key={connector.uid}>
              <button
                type="button"
                onClick={() => choose(connector)}
                className="flex h-11 w-full items-center justify-between rounded-lg bg-inset px-3 text-left text-[14px] font-600 text-ink transition-colors hover:bg-inset-2"
              >
                {connector.name}
                <ArrowRight
                  size={15}
                  strokeWidth={1.75}
                  className="text-muted"
                  aria-hidden="true"
                />
              </button>
            </li>
          ))}
        </ul>
        {error === null ? null : (
          <p role="alert" className="text-[13px] text-neg">
            {isUserRejection(error)
              ? "Connection rejected"
              : "Connection failed"}
          </p>
        )}
        <p className="text-[11px] text-secondary">
          <a
            className="font-650 text-accent-ink underline-offset-2 hover:underline"
            href={TERMS_URL}
            target="_blank"
            rel="noreferrer"
          >
            Terms
          </a>
          {" · "}
          <a
            className="font-650 text-accent-ink underline-offset-2 hover:underline"
            href={PRIVACY_URL}
            target="_blank"
            rel="noreferrer"
          >
            Privacy
          </a>
        </p>
      </>
    )
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content aria-describedby={undefined} size="sm">
        {body}
      </Dialog.Content>
    </Dialog.Root>
  )
}
