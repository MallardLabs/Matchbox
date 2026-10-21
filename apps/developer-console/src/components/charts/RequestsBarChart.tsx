import type { UsageBucket } from "@repo/platform-contracts/console"
import * as BarChart from "@repo/ui/bar-chart"
import type { ReactElement } from "react"
import {
  type UsageGroup,
  compactTick,
  requestBars,
} from "../../lib/usage-chart"

/** Requests per bar on the shared bar chart; current bar in accent. */
export default function RequestsBarChart({
  groups,
  bucket,
  title,
  height = 150,
  className,
}: {
  groups: readonly UsageGroup[]
  bucket: UsageBucket
  title: string
  height?: number
  className?: string | undefined
}): ReactElement {
  return (
    <BarChart.Root
      title={title}
      bars={requestBars(groups, bucket)}
      formatTick={compactTick}
      height={height}
      spacing={groups.length > 8 ? "compact" : "comfortable"}
      className={className}
    />
  )
}
