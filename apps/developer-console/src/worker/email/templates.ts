import type { EnvironmentKind } from "@repo/platform-contracts/network"

/** Plain, terse transactional emails (text + minimal HTML). */

export type EmailContent = {
  subject: string
  text: string
  html: string
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

function layout(lines: string[]): string {
  const body = lines.map((line) => `<p>${line}</p>`).join("")
  return `<!doctype html><html><body style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;color:#111">${body}<p style="color:#666;font-size:13px">Matchbox Developers</p></body></html>`
}

const footer = "Matchbox Developers"

const urlPattern = /(?:[a-z][a-z0-9+.-]*:\/\/|www\.)\S*/giu
const domainPattern =
  /[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.\p{L}{2,}(?:[/:?#]\S*)?/gu
const controlPattern = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu

/**
 * Renders user-controlled text (organization or inviter names) inside an
 * email: strips URLs, domain-like tokens and control/format characters,
 * collapses whitespace and caps the length so it cannot carry a phishing
 * link or fake instructions.
 */
export function inertText(
  value: string,
  fallback: string,
  maxLength = 60,
): string {
  const cleaned = value
    .normalize("NFKC")
    .replace(controlPattern, " ")
    .replace(urlPattern, " ")
    .replace(domainPattern, " ")
    .replace(/\s+/gu, " ")
    .trim()
  if (cleaned.length === 0) return fallback
  const chars = [...cleaned]
  return chars.length <= maxLength
    ? cleaned
    : `${chars
        .slice(0, maxLength - 1)
        .join("")
        .trimEnd()}…`
}

export function invitationEmail(input: {
  organizationName: string
  inviterName: string
  role: string
  link: string
}): EmailContent {
  const organization = inertText(input.organizationName, "an organization")
  const inviter = inertText(input.inviterName, "A teammate", 40)
  const host = new URL(input.link).host
  const line = `${inviter} invited you to ${organization} as ${input.role}.`
  const sender = `Sent by Matchbox (${host}). Only accept invitations on https://${host}.`
  return {
    subject: `Invitation to ${organization} on Matchbox`,
    text: [
      line,
      `Accept: ${input.link}`,
      "Expires in 7 days.",
      sender,
      footer,
    ].join("\n\n"),
    html: layout([
      escapeHtml(line),
      `<a href="${escapeHtml(input.link)}">Accept invitation</a>`,
      "Expires in 7 days.",
      escapeHtml(sender),
    ]),
  }
}

export type ReviewOutcome = "approved" | "changes-requested" | "rejected"

const outcomeLabels = {
  approved: "approved",
  "changes-requested": "changes requested",
  rejected: "rejected",
} as const satisfies Record<ReviewOutcome, string>

export function reviewDecisionEmail(input: {
  appName: string
  environmentKind: EnvironmentKind
  outcome: ReviewOutcome
  note: string | null
  link: string
}): EmailContent {
  const line = `Review for ${input.appName} (${input.environmentKind}): ${outcomeLabels[input.outcome]}.`
  const note = input.note === null ? [] : [`Note: ${input.note}`]
  return {
    subject: `${input.appName}: review ${outcomeLabels[input.outcome]}`,
    text: [line, ...note, `Details: ${input.link}`, footer].join("\n\n"),
    html: layout([
      escapeHtml(line),
      ...note.map(escapeHtml),
      `<a href="${escapeHtml(input.link)}">Open in console</a>`,
    ]),
  }
}
