export type CarouselStatus = "queued" | "signing" | "done" | "failed"

export type CarouselItem = {
  id: string
  label: string
  status: CarouselStatus
  error?: string
}

export type CarouselState = {
  items: CarouselItem[]
}

export function createCarousel(
  items: Array<{ id: string; label: string }>,
): CarouselState {
  return {
    items: items.map((item, index) => ({
      ...item,
      status: index === 0 ? "signing" : "queued",
    })),
  }
}

export function signingIndex(state: CarouselState): number {
  return state.items.findIndex((item) => item.status === "signing")
}

export function markConfirmed(state: CarouselState, id: string): CarouselState {
  const index = state.items.findIndex((item) => item.id === id)
  if (index < 0) return state
  const items = state.items.map((item, i) => {
    if (i === index)
      return { id: item.id, label: item.label, status: "done" as const }
    if (i === index + 1 && item.status === "queued") {
      return { ...item, status: "signing" as const }
    }
    return item
  })
  return { items }
}

export function markFailed(
  state: CarouselState,
  id: string,
  error: string,
): CarouselState {
  return {
    items: state.items.map((item) =>
      item.id === id ? { ...item, status: "failed", error } : item,
    ),
  }
}

export function retryItem(state: CarouselState, id: string): CarouselState {
  return {
    items: state.items.map((item) => {
      if (item.id === id)
        return { id: item.id, label: item.label, status: "signing" as const }
      if (item.status === "signing") return { ...item, status: "queued" }
      return item
    }),
  }
}

export function isAllDone(state: CarouselState): boolean {
  return (
    state.items.length > 0 &&
    state.items.every((item) => item.status === "done")
  )
}

export function hasQueuedAfter(state: CarouselState): boolean {
  const current = signingIndex(state)
  if (current < 0) return false
  return state.items.slice(current + 1).some((item) => item.status === "queued")
}
