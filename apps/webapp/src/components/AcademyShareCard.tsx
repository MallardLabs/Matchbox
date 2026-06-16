import { useEffect, useRef, useState } from "react"

type Props = {
  // Fully-built /api/og/academy URL for the connected wallet + current window.
  cardUrl: string
  onClose: () => void
}

const FILENAME = "mezo-academy-card.png"

// Modal that previews the shareable standings card and offers download /
// copy-to-clipboard. The image itself is rendered by /api/og/academy.
export default function AcademyShareCard({ cardUrl, onClose }: Props) {
  const [imgLoaded, setImgLoaded] = useState(false)
  const [imgError, setImgError] = useState(false)
  const [busy, setBusy] = useState<null | "download" | "copy">(null)
  const [copied, setCopied] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  // Cache the fetched PNG so download + copy don't refetch.
  const blobRef = useRef<Blob | null>(null)

  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current()
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [])

  // Clipboard image write isn't available everywhere (notably Firefox).
  const canCopy =
    typeof window !== "undefined" &&
    typeof ClipboardItem !== "undefined" &&
    !!navigator.clipboard?.write

  async function getBlob(): Promise<Blob> {
    if (blobRef.current) return blobRef.current
    const res = await fetch(cardUrl)
    if (!res.ok) throw new Error(`Failed to render card (${res.status})`)
    const blob = await res.blob()
    blobRef.current = blob
    return blob
  }

  async function handleDownload() {
    setActionError(null)
    setBusy("download")
    try {
      const blob = await getBlob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = FILENAME
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Download failed")
    } finally {
      setBusy(null)
    }
  }

  async function handleCopy() {
    setActionError(null)
    setBusy("copy")
    try {
      const blob = await getBlob()
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
      ])
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Couldn't copy to clipboard",
      )
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <button
        type="button"
        aria-label="Close share dialog"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-transparent"
      />
      <div className="relative z-[1] w-full max-w-2xl overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3">
          <span className="text-sm font-semibold text-[var(--content-primary)]">
            Share your standing
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-xl leading-none text-[var(--content-muted)] transition-colors hover:text-[var(--content-primary)]"
          >
            ×
          </button>
        </div>

        <div className="p-5">
          {/* Card preview (matches the rendered 1280×750 image) */}
          <div className="relative aspect-[128/75] w-full overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-tertiary)]">
            {!imgLoaded && !imgError && (
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-shimmer text-2xl font-semibold tracking-tight">
                  Rendering your card…
                </span>
              </div>
            )}
            {imgError ? (
              <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-xs text-red-400">
                Couldn't render the card. Please try again shortly.
              </div>
            ) : (
              <img
                src={cardUrl}
                alt="Your Mezo Academy standing card"
                className="h-full w-full object-cover"
                onLoad={() => setImgLoaded(true)}
                onError={() => setImgError(true)}
              />
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleDownload}
              disabled={busy !== null || imgError}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy === "download" ? "Preparing…" : "Download"}
            </button>
            {canCopy && (
              <button
                type="button"
                onClick={handleCopy}
                disabled={busy !== null || imgError}
                className="rounded-lg border border-[var(--border)] bg-[var(--surface-tertiary)] px-4 py-2 text-sm font-semibold text-[var(--content-primary)] transition-colors hover:border-brand disabled:cursor-not-allowed disabled:opacity-50"
              >
                {copied
                  ? "Copied!"
                  : busy === "copy"
                    ? "Copying…"
                    : "Copy to clipboard"}
              </button>
            )}
            {actionError && (
              <span className="text-xs text-red-400">{actionError}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
