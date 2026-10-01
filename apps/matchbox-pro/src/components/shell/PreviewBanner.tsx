import { CLASSIC_URL } from "@/lib/banner"
import { X } from "lucide-react"
import type { ReactElement } from "react"

type PreviewBannerProps = {
  onDismiss: () => void
}

export default function PreviewBanner({
  onDismiss,
}: PreviewBannerProps): ReactElement {
  return (
    <aside
      aria-label="Matchbox Pro preview"
      className="flex items-center gap-3 bg-accent-soft px-6 py-2.5"
    >
      <span className="flex h-[22px] items-center rounded bg-accent-soft-2 px-2 text-[11px] font-700 text-accent-ink">
        Preview
      </span>
      <span className="flex-1" />
      <a
        href={CLASSIC_URL}
        className="hidden h-[30px] items-center rounded-md border border-accent-line bg-surface px-3 text-[12px] font-650 text-accent-ink transition-colors hover:bg-accent-soft sm:inline-flex"
      >
        Return to Matchbox Classic
      </a>
      <button
        type="button"
        onClick={onDismiss}
        className="flex size-7 items-center justify-center rounded-md text-accent-ink/70 transition-colors hover:bg-accent-soft-2 hover:text-accent-ink"
        aria-label="Dismiss preview banner"
      >
        <X size={14} />
      </button>
    </aside>
  )
}
