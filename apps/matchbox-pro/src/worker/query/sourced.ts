import type { Fact, StuartResponse } from "../../features/query/contract"
import { type ModelView, UNTRUSTED_MODEL_KEYS } from "./outcome"

// Sourced-by-construction checks. Every digit Stuart shows must trace back to
// a fact (template answers) or to a structured value a tool returned in this
// turn (model answers). Addresses are checked the same way.

const ADDRESS_PATTERN = /0x[0-9a-fA-F]{3,}(?:…|\.\.\.)?[0-9a-fA-F]*/g
const NUMBER_PATTERN = /\d[\d,]*(?:\.\d+)?/g

/** "1,024.80" → "1024.8", "042" → "42", "0.50" → "0.5". */
export function canonicalNumber(token: string): string {
  const plain = token.replace(/,/g, "")
  const [whole = "0", fraction = ""] = plain.split(".")
  const trimmedWhole = whole.replace(/^0+(?=\d)/, "")
  const trimmedFraction = fraction.replace(/0+$/, "")
  return trimmedFraction ? `${trimmedWhole}.${trimmedFraction}` : trimmedWhole
}

export function addressTokens(text: string): string[] {
  return [...text.matchAll(ADDRESS_PATTERN)].map((match) => match[0])
}

export function numberTokens(text: string): string[] {
  const withoutAddresses = text.replace(ADDRESS_PATTERN, " ")
  return [...withoutAddresses.matchAll(NUMBER_PATTERN)].map((match) =>
    canonicalNumber(match[0]),
  )
}

export type SourcedSet = {
  numbers: Set<string>
  addresses: string[]
}

export function emptySourcedSet(): SourcedSet {
  return { numbers: new Set(), addresses: [] }
}

function addText(set: SourcedSet, text: string): void {
  for (const token of numberTokens(text)) set.numbers.add(token)
  for (const address of addressTokens(text)) {
    set.addresses.push(address.toLowerCase())
  }
}

export function addFacts(set: SourcedSet, facts: readonly Fact[]): void {
  for (const fact of facts) {
    // Entity names are untrusted text: their digits don't vouch for numbers.
    if (fact.value.kind === "text") continue
    addText(set, fact.display)
  }
}

export function addModelView(set: SourcedSet, view: ModelView): void {
  for (const row of view.rows) {
    for (const [key, value] of Object.entries(row)) {
      if (value === null || UNTRUSTED_MODEL_KEYS.has(key)) continue
      addText(set, value)
    }
  }
}

export function addAddresses(set: SourcedSet, addresses: readonly string[]) {
  for (const address of addresses) set.addresses.push(address.toLowerCase())
}

function addressIsKnown(token: string, known: readonly string[]): boolean {
  const lower = token.toLowerCase()
  const [head = "", tail = ""] = lower.split(/…|\.\.\./)
  if (!tail) return known.some((address) => address.startsWith(head))
  return known.some(
    (address) => address.startsWith(head) && address.endsWith(tail),
  )
}

export function unsourcedTokens(text: string, set: SourcedSet): string[] {
  const missingNumbers = numberTokens(text).filter(
    (token) => !set.numbers.has(token),
  )
  const missingAddresses = addressTokens(text).filter(
    (token) => !addressIsKnown(token, set.addresses),
  )
  return [...missingNumbers, ...missingAddresses]
}

const GREETING =
  /^\s*(hi|hello|hey|sure|great|certainly|of course|absolutely|happy to|i'd be happy|thanks)\b/i
const SUBMISSION_CLAIM =
  /\b(stuart|i|we|matchbox)\s+(have\s+|has\s+|just\s+)?(submitted|sent|signed|executed|broadcast|placed|cast)\b|\b(was|were|has been|have been)\s+(submitted|sent|executed|broadcast)\b/i

export type ModelAnswerCheck =
  | { ok: true }
  | {
      ok: false
      reason: "empty" | "too_long" | "greeting" | "claim" | "unsourced"
      detail: string[]
    }

export function checkModelAnswer(
  text: string,
  sourced: SourcedSet,
): ModelAnswerCheck {
  const trimmed = text.trim()
  if (!trimmed) return { ok: false, reason: "empty", detail: [] }
  const sentences = trimmed
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => sentence.trim().length > 0)
  if (trimmed.length > 280 || sentences.length > 2) {
    return { ok: false, reason: "too_long", detail: [] }
  }
  if (GREETING.test(trimmed))
    return { ok: false, reason: "greeting", detail: [] }
  if (SUBMISSION_CLAIM.test(trimmed)) {
    return { ok: false, reason: "claim", detail: [] }
  }
  const missing = unsourcedTokens(trimmed, sourced)
  if (missing.length > 0) {
    return { ok: false, reason: "unsourced", detail: missing }
  }
  return { ok: true }
}

export type SourcedViolation = {
  kind:
    | "answer_number"
    | "why_number"
    | "fact_evidence"
    | "block_evidence"
    | "answer_evidence"
    | "result_without_evidence"
  detail: string
}

/**
 * The invariant every response passes before it leaves the Worker. Template
 * answers may only print numbers held by the facts they reference.
 */
export function sourcedViolations(
  response: StuartResponse,
  turnSet: SourcedSet,
): SourcedViolation[] {
  const violations: SourcedViolation[] = []
  const evidenceIds = new Set(response.evidence.map((item) => item.id))
  const factsById = new Map(response.facts.map((fact) => [fact.id, fact]))

  for (const fact of response.facts) {
    for (const ref of fact.evidenceRefs) {
      if (!evidenceIds.has(ref)) {
        violations.push({ kind: "fact_evidence", detail: `${fact.id}:${ref}` })
      }
    }
  }
  for (const block of response.uiBlocks) {
    for (const ref of block.evidenceRefs) {
      if (!evidenceIds.has(ref)) {
        violations.push({
          kind: "block_evidence",
          detail: `${block.id}:${ref}`,
        })
      }
    }
  }
  for (const ref of response.answer.evidenceRefs) {
    if (!evidenceIds.has(ref)) {
      violations.push({ kind: "answer_evidence", detail: ref })
    }
  }
  if (response.answer.kind === "result" && response.evidence.length === 0) {
    violations.push({ kind: "result_without_evidence", detail: "" })
  }

  function referencedSet(refs: readonly string[]): SourcedSet {
    const set = emptySourcedSet()
    const facts = refs.flatMap((ref) => {
      const fact = factsById.get(ref)
      return fact ? [fact] : []
    })
    for (const fact of facts) {
      for (const token of numberTokens(fact.display)) set.numbers.add(token)
      for (const address of addressTokens(fact.display)) {
        set.addresses.push(address.toLowerCase())
      }
    }
    addAddresses(set, [response.wallet.address])
    return set
  }

  // Model answers are held to everything the turn's tools returned (facts and
  // structured row values); template answers to the facts they reference.
  const answerSet =
    response.answer.origin === "model"
      ? turnSet
      : referencedSet(response.answer.factRefs)
  for (const token of unsourcedTokens(response.answer.text, answerSet)) {
    violations.push({ kind: "answer_number", detail: token })
  }
  for (const item of response.why?.items ?? []) {
    const set = referencedSet(item.factRefs)
    for (const token of unsourcedTokens(item.text, set)) {
      violations.push({ kind: "why_number", detail: token })
    }
  }
  return violations
}
