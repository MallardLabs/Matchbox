import Button from "@/components/ui/Button"
import { useNetwork } from "@/lib/network"
import * as Dialog from "@radix-ui/react-dialog"
import { ArrowLeft, ArrowRight, X } from "lucide-react"
import { type ReactElement, type ReactNode, useState } from "react"
import { type Connector, useAccount, useConnect, useDisconnect } from "wagmi"

type ConnectModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const TERMS_URL = "https://mezo.org/legal/terms"
const PRIVACY_URL = "https://mezo.org/legal/privacy"

export default function ConnectModal({
  open,
  onOpenChange,
}: ConnectModalProps): ReactElement {
  const { connectors, connect, error, reset } = useConnect()
  const { address, isConnected } = useAccount()
  const { disconnect } = useDisconnect()
  const { networkName, switchNetwork } = useNetwork()
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
  if (isConnected && address) {
    body = (
      <>
        <Heading>Connected</Heading>
        <p className="text-[16px] font-650 tabular-nums text-ink">
          {address.slice(0, 6)}…{address.slice(-4)}
        </p>
        <div className="flex items-center justify-between gap-3 rounded-lg bg-inset px-3 py-2.5">
          <span className="text-[13px] text-secondary">
            Network <span className="font-600 text-ink">{networkName}</span>
          </span>
          <Button variant="ghost" size="sm" onClick={switchNetwork}>
            Switch
          </Button>
        </div>
        <Button
          variant="secondary"
          size="lg"
          className="w-full"
          onClick={() => {
            disconnect()
            onOpenChange(false)
          }}
        >
          Disconnect
        </Button>
      </>
    )
  } else if (pending) {
    body = (
      <>
        <Heading>Waiting for {pending.name}</Heading>
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
        <Heading>Connect wallet</Heading>
        <ul className="flex flex-col gap-3">
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
        {error ? (
          <p role="alert" className="text-[13px] text-neg">
            {error.message}
          </p>
        ) : null}
        <p className="text-[11px] text-secondary">
          By connecting you agree to the{" "}
          <a
            className="font-650 text-accent-ink underline-offset-2 hover:underline"
            href={TERMS_URL}
            target="_blank"
            rel="noreferrer"
          >
            Terms
          </a>{" "}
          and{" "}
          <a
            className="font-650 text-accent-ink underline-offset-2 hover:underline"
            href={PRIVACY_URL}
            target="_blank"
            rel="noreferrer"
          >
            Privacy Policy
          </a>
          .
        </p>
      </>
    )
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60 data-[state=open]:animate-[fade-in_160ms_ease-out]" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-50 flex w-[min(380px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col gap-3 rounded-xl bg-surface p-5 shadow-[0_16px_40px_rgb(0_0_0/0.16)]"
        >
          <Dialog.Close
            aria-label="Close"
            className="absolute right-3 top-3 flex size-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-inset hover:text-ink"
          >
            <X size={16} strokeWidth={1.75} />
          </Dialog.Close>
          {body}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function Heading({ children }: { children: ReactNode }): ReactElement {
  return (
    <Dialog.Title className="pr-8 text-[18px] font-650 text-ink">
      {children}
    </Dialog.Title>
  )
}
