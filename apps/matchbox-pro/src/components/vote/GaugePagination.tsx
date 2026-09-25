import { cn } from "@/lib/cn"
import type { ReactElement } from "react"

const WINDOW = 5

type GaugePaginationProps = {
  page: number
  pageCount: number
  onPageChange: (page: number) => void
}

export default function GaugePagination({
  page,
  pageCount,
  onPageChange,
}: GaugePaginationProps): ReactElement | null {
  if (pageCount <= 1) return null
  const first = Math.max(0, Math.min(page - 2, pageCount - WINDOW))
  const pages = Array.from(
    { length: Math.min(WINDOW, pageCount) },
    (_, index) => first + index,
  )

  return (
    <nav
      aria-label="Gauge pages"
      className="flex items-center justify-center gap-2"
    >
      <button
        type="button"
        aria-label="Previous page"
        disabled={page === 0}
        onClick={() => onPageChange(page - 1)}
        className="px-1 text-[14px] font-500 text-secondary hover:text-ink disabled:text-faint"
      >
        ←
      </button>
      <ol className="flex items-center gap-2">
        {pages.map((index) => (
          <li key={index}>
            <button
              type="button"
              aria-current={index === page ? "page" : undefined}
              onClick={() => onPageChange(index)}
              className={cn(
                "flex size-7 items-center justify-center rounded-[6px] text-[13px] tabular-nums",
                index === page
                  ? "bg-inset font-650 text-ink"
                  : "font-500 text-secondary hover:bg-inset",
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
        className="px-1 text-[14px] font-500 text-secondary hover:text-ink disabled:text-faint"
      >
        →
      </button>
    </nav>
  )
}
