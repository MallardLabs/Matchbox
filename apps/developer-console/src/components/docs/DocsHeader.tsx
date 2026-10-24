import * as SegmentedControl from "@repo/ui/segmented-control"
import type { ReactElement, ReactNode } from "react"
import { useDocsControls } from "../../lib/docs-context"
import { Crumb, Crumbs } from "../shell/Breadcrumbs"
import PageTitle from "../ui/PageTitle"
import { environmentNames } from "../ui/Pill"

/** Docs page head: "Docs" eyebrow, title, Test / Live switch (C07). */
export default function DocsHeader({
  title,
  children,
}: {
  title: string
  /** Facts or meta under the title. */
  children?: ReactNode
}): ReactElement {
  const { kind, setKind } = useDocsControls()
  return (
    <div className="flex flex-col gap-5">
      <Crumbs>
        <Crumb>Docs</Crumb>
        <Crumb current>{title}</Crumb>
      </Crumbs>
      <PageTitle
        eyebrow="Docs"
        title={title}
        actions={
          <SegmentedControl.Root
            aria-label="Environment"
            value={kind}
            onValueChange={(value) =>
              setKind(value === "live" ? "live" : "test")
            }
          >
            {(["test", "live"] as const).map((option) => (
              <SegmentedControl.Item
                key={option}
                value={option}
                className="px-3.5 text-body-sm"
              >
                {environmentNames[option]}
              </SegmentedControl.Item>
            ))}
          </SegmentedControl.Root>
        }
      />
      {children}
    </div>
  )
}
