const dateFormat = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "short",
  day: "numeric",
})

const shortDateFormat = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
})

const dateTimeFormat = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
})

export function formatDate(iso: string): string {
  return dateFormat.format(new Date(iso))
}

/** "Oct 21" this year, "Oct 21, 2025" otherwise. */
export function formatShortDate(iso: string, now: Date = new Date()): string {
  const date = new Date(iso)
  return date.getFullYear() === now.getFullYear()
    ? shortDateFormat.format(date)
    : dateFormat.format(date)
}

export function formatDateTime(iso: string): string {
  return dateTimeFormat.format(new Date(iso))
}
