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

export type CodePurpose = "sign-up" | "recovery"

const codeSubjects = {
  "sign-up": "Your Matchbox sign-up code",
  recovery: "Your Matchbox recovery code",
} as const satisfies Record<CodePurpose, string>

export function codeEmail(code: string, purpose: CodePurpose): EmailContent {
  const intro =
    purpose === "sign-up" ? "Sign-up code:" : "Account recovery code:"
  return {
    subject: codeSubjects[purpose],
    text: `${intro} ${code}\n\nExpires in 15 minutes. If you did not request it, ignore this email.\n\n${footer}`,
    html: layout([
      escapeHtml(intro),
      `<strong style="font-family:ui-monospace,monospace;font-size:22px;letter-spacing:4px">${escapeHtml(code)}</strong>`,
      "Expires in 15 minutes. If you did not request it, ignore this email.",
    ]),
  }
}

export function existingAccountEmail(signInUrl: string): EmailContent {
  return {
    subject: "Your Matchbox developer account",
    text: `This email already has an account. Sign in with your passkey or recover access: ${signInUrl}\n\n${footer}`,
    html: layout([
      "This email already has an account.",
      `<a href="${escapeHtml(signInUrl)}">Sign in or recover access</a>`,
    ]),
  }
}

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

export type PasskeyChange = "added" | "removed"

const passkeyChangeSubjects = {
  added: "Passkey added to your Matchbox developer account",
  removed: "Passkey removed from your Matchbox developer account",
} as const satisfies Record<PasskeyChange, string>

export function passkeyChangedEmail(input: {
  change: PasskeyChange
  passkeyName: string | null
  at: string
  accountUrl: string
}): EmailContent {
  const name = inertText(input.passkeyName ?? "", "Unnamed passkey", 64)
  const line = `Passkey ${input.change}: ${name}. Time: ${input.at}.`
  const help =
    input.change === "removed"
      ? "Other sessions were signed out."
      : "Not you? Recover your account and remove it."
  return {
    subject: passkeyChangeSubjects[input.change],
    text: [line, help, `Passkeys: ${input.accountUrl}`, footer].join("\n\n"),
    html: layout([
      escapeHtml(line),
      escapeHtml(help),
      `<a href="${escapeHtml(input.accountUrl)}">Review passkeys</a>`,
    ]),
  }
}

export function accountRecoveredEmail(input: {
  at: string
  accountUrl: string
}): EmailContent {
  const line = `Account recovered by email. A new passkey was added. Time: ${input.at}.`
  const help =
    "It cannot confirm sensitive actions for 24 hours. Not you? Sign in with an existing passkey, remove it and sign out everywhere."
  return {
    subject: "Your Matchbox developer account was recovered",
    text: [line, help, `Account: ${input.accountUrl}`, footer].join("\n\n"),
    html: layout([
      escapeHtml(line),
      escapeHtml(help),
      `<a href="${escapeHtml(input.accountUrl)}">Review account</a>`,
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
