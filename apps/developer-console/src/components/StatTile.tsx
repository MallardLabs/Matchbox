import * as Skeleton from "@repo/ui/skeleton"
import type { ReactElement, ReactNode } from "react"

type StatTileProps = {
  label: string
  value: ReactNode
  detail?: ReactNode
  loading?: boolean
}

/** Label over a large tabular value; skeleton keeps the same height. */
export default function StatTile({
  label,
  value,
  detail,
  loading = false,
}: StatTileProps): ReactElement {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 border-t border-line py-4">
      <dt className="text-[12px] font-500 text-secondary">{label}</dt>
      <dd className="m-0 flex min-h-[34px] items-baseline gap-2">
        {loading ? (
          <Skeleton.Root className="h-7 w-24" />
        ) : (
          <span className="text-[26px] font-600 leading-none text-ink">
            {value}
          </span>
        )}
        {detail === undefined || loading ? null : (
          <span className="text-[12px] text-secondary">{detail}</span>
        )}
      </dd>
    </div>
  )
}
