import {
  type ReactElement,
  type TextareaHTMLAttributes,
  forwardRef,
} from "react"
import { controlStyles } from "./input"

const ROOT_NAME = "Textarea"

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  mono?: boolean
}

export const Root = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea(
    { mono = false, className, rows = 4, ...props },
    ref,
  ): ReactElement {
    return (
      <textarea
        ref={ref}
        rows={rows}
        className={controlStyles({
          mono,
          className: [
            "h-auto min-h-[76px] resize-y px-2.5 py-2 text-[13px] leading-5",
            className,
          ],
        })}
        {...props}
      />
    )
  },
)
Root.displayName = ROOT_NAME
