import { useCallback, useEffect, useMemo, useState } from "react"

type UsePaginationOptions = {
  pageSize: number
  resetDeps?: readonly unknown[]
}

export function usePagination<T>(
  items: T[],
  { pageSize, resetDeps = [] }: UsePaginationOptions,
) {
  const [currentPage, setCurrentPage] = useState(1)

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize))
  const pageStartIndex = (currentPage - 1) * pageSize
  const paginatedItems = useMemo(
    () => items.slice(pageStartIndex, pageStartIndex + pageSize),
    [items, pageSize, pageStartIndex],
  )
  const pageStart = items.length === 0 ? 0 : pageStartIndex + 1
  const pageEnd = Math.min(pageStartIndex + pageSize, items.length)

  useEffect(() => {
    setCurrentPage(1)
  }, resetDeps)

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages))
  }, [totalPages])

  const goToPage = useCallback(
    (page: number) => {
      setCurrentPage(Math.min(Math.max(1, page), totalPages))
    },
    [totalPages],
  )

  const goToPreviousPage = useCallback(() => {
    setCurrentPage((page) => Math.max(1, page - 1))
  }, [])

  const goToNextPage = useCallback(() => {
    setCurrentPage((page) => Math.min(totalPages, page + 1))
  }, [totalPages])

  return {
    currentPage,
    totalPages,
    pageStart,
    pageEnd,
    paginatedItems,
    goToPage,
    goToPreviousPage,
    goToNextPage,
  }
}
