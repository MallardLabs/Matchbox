import { formatAPY } from "@/hooks/useAPY"
import { cn } from "@/utils/cn"
import {
  calculateRewardPer10kVeMezo,
  formatRewardPer10kVeMezo,
} from "@/utils/rewardPerVeMezo"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useState } from "react"

type ApyMetricProps = {
  apy: number | null
  totalIncentivesUsd: number
  currentVeMezoWeight: bigint | undefined
  isLoading?: boolean
  className?: string
}

export default function ApyMetric({
  apy,
  totalIncentivesUsd,
  currentVeMezoWeight,
  isLoading = false,
  className,
}: ApyMetricProps): JSX.Element {
  const prefersReducedMotion = useReducedMotion()
  const [pointerActive, setPointerActive] = useState(false)
  const [focusActive, setFocusActive] = useState(false)
  const [tapActive, setTapActive] = useState(false)
  const showMarginalReward = pointerActive || focusActive || tapActive
  const apyText = isLoading ? "…" : formatAPY(apy)
  const reward = calculateRewardPer10kVeMezo(
    String(totalIncentivesUsd),
    currentVeMezoWeight,
  )
  const rewardText = isLoading ? "…" : formatRewardPer10kVeMezo(reward)
  const displayText = showMarginalReward ? rewardText : apyText
  const motionOffset = prefersReducedMotion ? 0 : 10

  return (
    <button
      type="button"
      aria-label={`${displayText}. Toggle APY and estimated rewards for a new 10k veMEZO vote.`}
      aria-pressed={tapActive}
      onPointerEnter={() => setPointerActive(true)}
      onPointerLeave={() => setPointerActive(false)}
      onFocus={() => setFocusActive(true)}
      onBlur={() => setFocusActive(false)}
      onPointerUp={(event) => {
        if (event.pointerType !== "mouse") {
          setTapActive((current) => !current)
        }
      }}
      onClick={(event) => {
        if (event.detail === 0) setTapActive((current) => !current)
      }}
      className={cn(
        "relative inline-grid max-w-full cursor-pointer overflow-hidden rounded-sm text-left font-mono tabular-nums focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F7931A]",
        className,
      )}
    >
      <span className="invisible col-start-1 row-start-1">{apyText}</span>
      <span className="invisible col-start-1 row-start-1">{rewardText}</span>
      <AnimatePresence initial={false} mode="wait">
        <motion.span
          key={showMarginalReward ? "reward" : "apy"}
          className="absolute inset-0 flex items-center whitespace-nowrap"
          initial={{
            opacity: 0,
            y: showMarginalReward ? motionOffset : -motionOffset,
          }}
          animate={{ opacity: 1, y: 0 }}
          exit={{
            opacity: 0,
            y: showMarginalReward ? -motionOffset : motionOffset,
          }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.16 }}
        >
          {displayText}
        </motion.span>
      </AnimatePresence>
    </button>
  )
}
