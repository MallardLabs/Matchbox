import { formatAPY, formatRewardPer10kVeMEZO } from "@/hooks/useAPY"
import { AnimatePresence, motion } from "motion/react"
import { useState } from "react"

type AnimatedApyValueProps = {
  apy: number | null
  totalIncentivesUSD?: number
  totalWeight?: bigint
  isLoading?: boolean
  className?: string
  title?: string
}

export function AnimatedApyValue({
  apy,
  totalIncentivesUSD = 0,
  totalWeight,
  isLoading = false,
  className = "",
  title,
}: AnimatedApyValueProps) {
  const [isHovered, setIsHovered] = useState(false)

  if (isLoading) {
    return <span className={className}>...</span>
  }

  const apyText = formatAPY(apy)
  const reward10kText = formatRewardPer10kVeMEZO(
    totalIncentivesUSD,
    totalWeight,
  )

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`relative inline-flex flex-col overflow-hidden align-bottom ${className}`}
      title={
        title ??
        (isHovered
          ? "Estimated reward per 10k veMEZO votes"
          : "Annualized percentage yield")
      }
      style={{ cursor: "pointer", minHeight: "1.25em" }}
    >
      <AnimatePresence initial={false} mode="popLayout">
        {!isHovered ? (
          <motion.span
            key="apy"
            initial={{ y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -16, opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="inline-block"
          >
            {apyText}
          </motion.span>
        ) : (
          <motion.span
            key="reward10k"
            initial={{ y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -16, opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="inline-block text-[#F7931A]"
          >
            {reward10kText}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  )
}

export default AnimatedApyValue
