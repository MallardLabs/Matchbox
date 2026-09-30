import * as Skeleton from "@repo/ui/skeleton"
import type { ReactElement } from "react"

export default function PageSkeleton(): ReactElement {
  return (
    <div aria-busy="true" className="flex flex-col gap-4 py-2">
      <output className="sr-only">Loading</output>
      <Skeleton.Root shape="line" className="h-7 w-48" />
      <Skeleton.Root shape="block" className="h-40" />
      <Skeleton.Root shape="block" className="h-24" />
    </div>
  )
}
