import type { Viewer } from "@/lib/viewer"

/**
 * Questions offered before anything is typed (palette, empty canvas). Only
 * questions the runtime has tools for; none assert a number.
 */
export function suggestedQuestions({
  viewer,
  topGauge,
}: {
  viewer: Viewer
  topGauge: string | null
}): string[] {
  const questions: string[] = []
  if (topGauge) questions.push(`Why did ${topGauge} APY change?`)
  questions.push("What should I vote this epoch?")
  if (viewer.mode !== "disconnected") {
    questions.push("How healthy is my mUSD trove?")
    questions.push("What can I claim?")
  }
  questions.push("Which gauges are most consistently funded?")
  return questions
}
