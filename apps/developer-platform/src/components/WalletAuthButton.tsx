import dynamic from "next/dynamic"

export type WalletAuthButtonProps = {
  onAuthenticated: () => Promise<void> | void
  inverse?: boolean
}

const ClientWalletAuthButton = dynamic(
  () =>
    import("@/components/WalletAuthButtonClient").then(
      (mod) => mod.WalletAuthButtonClient,
    ),
  {
    ssr: false,
    loading: () => (
      <button type="button" className="primary-button w-full" disabled>
        Loading wallet&hellip;
      </button>
    ),
  },
)

export function WalletAuthButton(props: WalletAuthButtonProps): JSX.Element {
  return <ClientWalletAuthButton {...props} />
}
