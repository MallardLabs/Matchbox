import { cn } from "@repo/ui/cn"
import { ArrowLeft, ArrowRight } from "lucide-react"
import type { ReactElement } from "react"

const WINDOW = 5

type PaginationProps = {
  /** Zero-based. */
  page: number
  pageCount: number
  label: string
  onPageChange: (page: number) => void
}

export default function Pagination({
  page,
  pageCount,
  label,
  onPageChange,
}: PaginationProps): ReactElement | null {
  if (pageCount <= 1) return null
  const first = Math.max(0, Math.min(page - 2, pageCount - WINDOW))
  const pages = Array.from(
    { length: Math.min(WINDOW, pageCount) },
    (_, index) => first + index,
  )
  return (
    <nav aria-label={label} className="flex items-center justify-center gap-2">
      <button
        type="button"
        aria-label="Previous page"
        disabled={page === 0}
        onClick={() => onPageChange(page - 1)}
        className="flex size-7 items-center justify-center rounded-[6px] text-secondary hover:text-ink disabled:text-faint"
      >
        <ArrowLeft aria-hidden="true" size={14} strokeWidth={1.75} />
      </button>
      <ol className="m-0 flex list-none items-center gap-2 p-0">
        {pages.map((index) => (
          <li key={index}>
            <button
              type="button"
              aria-current={index === page ? "page" : undefined}
              aria-label={`Page ${index + 1}`}
              onClick={() => onPageChange(index)}
              className={cn(
                "flex size-7 items-center justify-center rounded-[6px] text-body-sm tabular-nums",
                index === page
                  ? "bg-inset font-500 text-ink"
                  : "font-500 text-secondary hover:bg-inset hover:text-ink",
              )}
            >
              {index + 1}
            </button>
          </li>
        ))}
      </ol>
      <button
        type="button"
        aria-label="Next page"
        disabled={page + 1 >= pageCount}
        onClick={() => onPageChange(page + 1)}
        className="flex size-7 items-center justify-center rounded-[6px] text-secondary hover:text-ink disabled:text-faint"
      >
        <ArrowRight aria-hidden="true" size={14} strokeWidth={1.75} />
      </button>
    </nav>
  )
}
