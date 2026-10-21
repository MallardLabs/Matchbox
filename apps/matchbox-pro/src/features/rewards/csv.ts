// RFC 4180 CSV with spreadsheet formula guarding: token symbols and names
// come from chain data, so a cell starting with = + - @ is prefixed with '
// unless it is a plain number.
const NUMERIC = /^-?\d+(\.\d+)?$/
const FORMULA = /^[=+\-@\t\r]/

export function csvCell(value: string | number | bigint | null): string {
  if (value === null) return ""
  let text = String(value)
  if (!NUMERIC.test(text) && FORMULA.test(text)) text = `'${text}`
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export function toCsv(
  headers: string[],
  rows: Array<Array<string | number | bigint | null>>,
): string {
  return [headers, ...rows]
    .map((row) => row.map((cell) => csvCell(cell)).join(","))
    .join("\r\n")
}

/** `matchbox-rewards-<address>-<YYYY-MM-DD>.csv` in UTC. */
export function csvFilename(kind: string, address: string, now: Date): string {
  return `matchbox-${kind}-${address.toLowerCase()}-${now.toISOString().slice(0, 10)}.csv`
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}
