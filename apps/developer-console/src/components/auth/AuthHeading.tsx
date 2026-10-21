import { Link } from "@tanstack/react-router"
import { ArrowLeft } from "lucide-react"
import type { ReactElement, ReactNode } from "react"

/** Auth page title with an optional back link to sign-in. */
export default function AuthHeading({
  title,
  back = false,
  children,
}: {
  title: string
  /** Show the "Sign in" back link above the title. */
  back?: boolean
  children?: ReactNode
}): ReactElement {
  return (
    <header className="mb-7 flex flex-col gap-3">
      {back ? (
        <Link
          to="/sign-in"
          className="inline-flex items-center gap-2 self-start text-body-sm font-500 text-secondary hover:text-ink"
        >
          <ArrowLeft aria-hidden="true" size={14} strokeWidth={1.75} />
          Sign in
        </Link>
      ) : null}
      <h1 className="text-title font-600 tracking-[-0.01em] text-ink md:text-[30px] md:leading-9">
        {title}
      </h1>
      {children}
    </header>
  )
}
