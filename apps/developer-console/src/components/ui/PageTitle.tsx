import * as PageHeader from "@repo/ui/page-header"
import type { ReactElement, ReactNode } from "react"

/** Page header: small eyebrow, 28px title, adornment chip, actions right. */
export default function PageTitle({
  eyebrow,
  title,
  adornment,
  actions,
}: {
  eyebrow?: ReactNode
  title: ReactNode
  /** Status or slug next to the title. */
  adornment?: ReactNode
  actions?: ReactNode
}): ReactElement {
  return (
    <PageHeader.Root className="gap-y-3">
      <PageHeader.Heading className="gap-1.5">
        {eyebrow === undefined ? null : (
          <PageHeader.Eyebrow className="truncate text-label font-400 normal-case tracking-normal text-muted">
            {eyebrow}
          </PageHeader.Eyebrow>
        )}
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <PageHeader.Title className="min-w-0 break-words text-title">
            {title}
          </PageHeader.Title>
          {adornment}
        </div>
      </PageHeader.Heading>
      {actions === undefined ? null : (
        <PageHeader.Actions>{actions}</PageHeader.Actions>
      )}
    </PageHeader.Root>
  )
}
