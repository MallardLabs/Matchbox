/** Light client-side CIDR check; the server validates authoritatively. */
const cidrPattern =
  /^(?:(?:\d{1,3}\.){3}\d{1,3}\/\d{1,2}|[0-9a-fA-F:]+:[0-9a-fA-F:]*\/\d{1,3})$/

export function parseCidrList(value: string): {
  cidrs: string[]
  invalid: string[]
} {
  const entries = value
    .split(/[\s,]+/)
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "")
  return {
    cidrs: entries,
    invalid: entries.filter((entry) => !cidrPattern.test(entry)),
  }
}
