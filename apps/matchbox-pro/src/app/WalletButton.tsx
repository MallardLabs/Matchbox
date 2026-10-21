import { chainName, useNetwork } from "@/lib/network"
import { useViewer } from "@/lib/viewer"
import * as Button from "@repo/ui/button"
import { cn } from "@repo/ui/cn"
import * as DropdownMenu from "@repo/ui/dropdown-menu"
import * as Toast from "@repo/ui/toast"
import { shortenAddress } from "@repo/ui/wallet-address"
import {
  ChevronDown,
  Copy,
  Eye,
  FlaskConical,
  LogOut,
  SquareArrowOutUpRight,
} from "lucide-react"
import type { ReactElement } from "react"
import { useDisconnect } from "wagmi"
import { useConnectDialog } from "./ConnectDialog"

const EXPLORER_URL = {
  mainnet:
    import.meta.env.VITE_EXPLORER_MAINNET_URL ?? "https://explorer.mezo.org",
  testnet:
    import.meta.env.VITE_EXPLORER_TESTNET_URL ??
    "https://explorer.test.mezo.org",
}

type WalletButtonProps = {
  /** Mobile: compact pill with a status dot instead of the full chip. */
  compact?: boolean
}

export default function WalletButton({
  compact = false,
}: WalletButtonProps): ReactElement {
  const { viewer, stopWatching } = useViewer()
  const { isMainnet, networkName, switchNetwork, walletChainId } = useNetwork()
  const { disconnect } = useDisconnect()
  const { open } = useConnectDialog()
  const { toast } = Toast.useToast()

  if (viewer.mode === "disconnected") {
    return (
      <Button.Root size={compact ? "md" : "lg"} onClick={open}>
        {compact ? "Connect" : "Connect wallet"}
      </Button.Root>
    )
  }

  const address = viewer.address
  const short = shortenAddress(address)
  const explorer = isMainnet ? EXPLORER_URL.mainnet : EXPLORER_URL.testnet
  const watching = viewer.mode === "watching"
  const wrongNetwork = viewer.mode === "connected" && viewer.wrongNetwork

  async function copyAddress(): Promise<void> {
    try {
      await navigator.clipboard.writeText(address)
      toast({ title: "Address copied", tone: "success" })
    } catch {
      toast({ title: "Couldn't copy the address", tone: "error" })
    }
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={
            watching ? `Watching ${short}` : `Wallet ${short}, open menu`
          }
          className={cn(
            "flex h-10 items-center gap-[9px] rounded-md border border-line bg-surface px-[11px] transition-colors hover:border-line-2",
            compact ? "h-9 rounded-full px-3" : "md:min-w-[193px]",
          )}
        >
          {compact ? (
            <span
              aria-hidden="true"
              className={cn(
                "size-1.5 rounded-full",
                watching ? "bg-accent" : wrongNetwork ? "bg-neg" : "bg-pos",
              )}
            />
          ) : watching ? (
            <Eye
              aria-hidden="true"
              size={15}
              strokeWidth={1.75}
              className="text-accent-ink"
            />
          ) : (
            <span
              aria-hidden="true"
              className="flex size-5 items-center justify-center rounded-[5px] bg-inset-2 font-mono text-[7px] font-500 text-accent-ink"
            >
              0x
            </span>
          )}
          <span className="font-mono text-label font-500 text-ink-2">
            {watching && !compact ? "Watching " : ""}
            {short}
            {wrongNetwork && !compact ? (
              <span className="text-neg"> · {chainName(walletChainId)}</span>
            ) : null}
          </span>
          {compact ? null : (
            <>
              <span className="flex-1" />
              <ChevronDown
                aria-hidden="true"
                size={13}
                className="text-muted"
              />
            </>
          )}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Content align="end" className="min-w-[220px]">
        <DropdownMenu.Label>
          {watching ? "Watching (read-only)" : `Connected · ${networkName}`}
        </DropdownMenu.Label>
        <DropdownMenu.Item onSelect={() => void copyAddress()}>
          <Copy aria-hidden="true" size={14} strokeWidth={1.75} />
          Copy address
        </DropdownMenu.Item>
        <DropdownMenu.Item asChild>
          <a
            href={`${explorer}/address/${address}`}
            target="_blank"
            rel="noreferrer"
          >
            <SquareArrowOutUpRight
              aria-hidden="true"
              size={14}
              strokeWidth={1.75}
            />
            View on explorer
          </a>
        </DropdownMenu.Item>
        <DropdownMenu.Separator />
        {watching ? (
          <>
            <DropdownMenu.Item onSelect={open}>
              Connect a wallet
            </DropdownMenu.Item>
            <DropdownMenu.Item onSelect={stopWatching}>
              <LogOut aria-hidden="true" size={14} strokeWidth={1.75} />
              Stop watching
            </DropdownMenu.Item>
          </>
        ) : (
          <>
            <DropdownMenu.Item onSelect={switchNetwork}>
              <FlaskConical aria-hidden="true" size={14} strokeWidth={1.75} />
              {isMainnet ? "Developer mode: use testnet" : "Back to mainnet"}
            </DropdownMenu.Item>
            <DropdownMenu.Item onSelect={() => disconnect()}>
              <LogOut aria-hidden="true" size={14} strokeWidth={1.75} />
              Disconnect
            </DropdownMenu.Item>
          </>
        )}
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  )
}
