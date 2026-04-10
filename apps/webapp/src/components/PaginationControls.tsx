import { Button } from "@mezo-org/mezo-clay"

type PaginationControlsProps = {
  currentPage: number
  totalPages: number
  pageStart: number
  pageEnd: number
  totalItems: number
  itemLabel: string
  onPrevious: () => void
  onNext: () => void
}

export default function PaginationControls({
  currentPage,
  totalPages,
  pageStart,
  pageEnd,
  totalItems,
  itemLabel,
  onPrevious,
  onNext,
}: PaginationControlsProps) {
  if (totalItems === 0) {
    return null
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-secondary)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs text-[var(--content-secondary)]">
        Showing{" "}
        <span className="font-mono text-[var(--content-primary)]">
          {pageStart}-{pageEnd}
        </span>{" "}
        of{" "}
        <span className="font-mono text-[var(--content-primary)]">
          {totalItems}
        </span>{" "}
        {itemLabel}
        {totalItems === 1 ? "" : "s"}
      </p>

      <div className="flex items-center gap-2 self-start sm:self-auto">
        <Button
          kind="secondary"
          size="small"
          onClick={onPrevious}
          disabled={currentPage === 1}
        >
          Previous
        </Button>
        <span className="min-w-[72px] text-center text-xs text-[var(--content-secondary)]">
          Page {currentPage} of {totalPages}
        </span>
        <Button
          kind="secondary"
          size="small"
          onClick={onNext}
          disabled={currentPage === totalPages}
        >
          Next
        </Button>
      </div>
    </div>
  )
}
