import { describeWriteError } from "@/lib/writeErrors"
import * as Dialog from "@repo/ui/dialog"
import * as Toast from "@repo/ui/toast"
import { shortenAddress } from "@repo/ui/wallet-address"
import { ArrowLeft, ArrowRight } from "lucide-react"
import {
  type ReactElement,
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react"
import { type Connector, useConnect } from "wagmi"

const TERMS_URL = "https://mezo.org/legal/terms"
const PRIVACY_URL = "https://mezo.org/legal/privacy"

type ConnectDialogContextValue = { open: () => void }

const ConnectDialogContext = createContext<ConnectDialogContextValue | null>(
  null,
)

export function useConnectDialog(): ConnectDialogContextValue {
  const value = useContext(ConnectDialogContext)
  if (!value) {
    throw new Error(
      "useConnectDialog must be used inside <ConnectDialogProvider>",
    )
  }
  return value
}

export function ConnectDialogProvider({
  children,
}: {
  children: ReactNode
}): ReactElement {
  const [isOpen, setIsOpen] = useState(false)
  const open = useCallback(() => setIsOpen(true), [])
  const value = useMemo(() => ({ open }), [open])
  return (
    <ConnectDialogContext.Provider value={value}>
      {children}
      <ConnectDialog open={isOpen} onOpenChange={setIsOpen} />
    </ConnectDialogContext.Provider>
  )
}

function ConnectDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}): ReactElement {
  const { connectors, connect, error, reset } = useConnect()
  const { toast } = Toast.useToast()
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
        onSuccess: (data) => {
          onOpenChange(false)
          const account = data.accounts[0]
          toast({
            title: "Wallet connected",
            tone: "success",
            ...(account
              ? {
                  description: `${shortenAddress(account)} can vote, claim, and manage locks.`,
                }
              : {}),
          })
        },
        onSettled: () => setPending(null),
      },
    )
  }

  function chooseAgain(): void {
    reset()
    setPending(null)
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) chooseAgain()
        onOpenChange(next)
      }}
    >
      <Dialog.Content aria-describedby={undefined} size="sm">
        {pending ? (
          <>
            <Dialog.Header>
              <Dialog.Title>Waiting for {pending.name}</Dialog.Title>
              <p className="text-body-sm text-secondary">
                Confirm the connection in your wallet.
              </p>
            </Dialog.Header>
            <output className="flex h-[72px] items-center justify-center text-body font-500 text-accent-ink">
              Connecting…
            </output>
            <button
              type="button"
              onClick={chooseAgain}
              className="flex items-center gap-1.5 self-start text-label font-500 text-secondary transition-colors hover:text-ink"
            >
              <ArrowLeft aria-hidden="true" size={13} strokeWidth={1.75} />
              Choose a different wallet
            </button>
          </>
        ) : (
          <>
            <Dialog.Header>
              <Dialog.Title>Connect wallet</Dialog.Title>
            </Dialog.Header>
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {visible.map((connector) => (
                <li key={connector.uid}>
                  <button
                    type="button"
                    onClick={() => choose(connector)}
                    className="flex h-11 w-full items-center justify-between rounded-lg bg-inset px-3 text-left text-body font-600 text-ink transition-colors hover:bg-inset-2"
                  >
                    <span className="flex items-center gap-2.5">
                      {connector.icon ? (
                        <img
                          src={connector.icon}
                          alt=""
                          className="size-5 rounded"
                        />
                      ) : null}
                      {connector.name}
                    </span>
                    <ArrowRight
                      aria-hidden="true"
                      size={15}
                      strokeWidth={1.75}
                      className="text-muted"
                    />
                  </button>
                </li>
              ))}
            </ul>
            {error ? (
              <p role="alert" className="text-body-sm text-neg">
                {describeWriteError(error).message}
              </p>
            ) : null}
            <p className="text-caption text-secondary">
              By connecting you agree to the Terms of Service and Privacy
              Policy.
            </p>
            <p className="flex gap-3 text-label">
              <a
                className="font-600 text-accent-ink underline-offset-2 hover:underline"
                href={TERMS_URL}
                target="_blank"
                rel="noreferrer"
              >
                Terms of Service
              </a>
              <a
                className="font-600 text-accent-ink underline-offset-2 hover:underline"
                href={PRIVACY_URL}
                target="_blank"
                rel="noreferrer"
              >
                Privacy Policy
              </a>
            </p>
          </>
        )}
      </Dialog.Content>
    </Dialog.Root>
  )
}
