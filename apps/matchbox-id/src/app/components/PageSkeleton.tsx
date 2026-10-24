import * as Skeleton from "@repo/ui/skeleton"
import type { ReactElement } from "react"

export default function PageSkeleton(): ReactElement {
  return (
    <div
      aria-busy="true"
      className="mx-auto flex w-full max-w-[1008px] flex-col gap-4 px-4 pt-6 md:px-6 md:pt-9"
    >
      <output className="sr-only">Loading</output>
      <Skeleton.Root className="w-20" />
      <Skeleton.Root className="h-8 w-56" />
      <Skeleton.Root shape="block" className="h-16" />
      <Skeleton.Root shape="block" className="h-40" />
    </div>
  )
}
