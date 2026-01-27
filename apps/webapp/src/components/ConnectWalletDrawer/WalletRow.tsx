type WalletRowProps = {
  name: string
  icon: string | undefined
  isInstalled: boolean
  isPending: boolean
  downloadUrl: string | undefined
  onConnect: () => void
}

function Spinner(): JSX.Element {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className="animate-spin"
      aria-hidden="true"
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  )
}

export function WalletRow({
  name,
  icon,
  isInstalled,
  isPending,
  downloadUrl,
  onConnect,
}: WalletRowProps): JSX.Element {
  function handleClick() {
    if (isPending) return
    if (!isInstalled && downloadUrl) {
      window.open(downloadUrl, "_blank", "noopener,noreferrer")
      return
    }
    onConnect()
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-[var(--surface-secondary)] disabled:opacity-60"
    >
      <span className="flex items-center gap-3">
        {icon ? (
          <img src={icon} alt="" className="h-10 w-10 rounded-lg" />
        ) : (
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--border)] text-xs font-medium text-[var(--content-secondary)]">
            {name.slice(0, 2)}
          </span>
        )}
        <span className="text-sm font-medium text-[var(--content-primary)]">
          {name}
        </span>
      </span>

      <span className="text-xs text-[var(--content-secondary)]">
        {isPending ? (
          <Spinner />
        ) : isInstalled ? (
          "Connect"
        ) : (
          <span className="flex items-center gap-1">
            Get
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </span>
        )}
      </span>
    </button>
  )
}
