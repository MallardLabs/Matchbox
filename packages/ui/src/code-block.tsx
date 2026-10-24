import * as TabsPrimitive from "@radix-ui/react-tabs"
import {
  type HTMLAttributes,
  type ReactElement,
  forwardRef,
  useState,
} from "react"
import { cn } from "./cn"
import { CopyButton } from "./copy-button"

const ROOT_NAME = "CodeBlock"

export type CodeSnippet = {
  /** Stable key, e.g. "ts" or "curl". */
  language: string
  /** Tab label, e.g. "TypeScript". */
  label: string
  code: string
}

type SingleSource = {
  code: string
  /** Header label, e.g. "curl" or a file name. */
  title?: string
}

type TabbedSource = {
  snippets: [CodeSnippet, ...CodeSnippet[]]
  language?: string
  defaultLanguage?: string
  onLanguageChange?: (language: string) => void
}

type FrameProps = Omit<
  HTMLAttributes<HTMLDivElement>,
  "title" | "defaultValue" | "dir"
>

export type CodeBlockProps = FrameProps & (SingleSource | TabbedSource)

const frame =
  "flex min-w-0 flex-col overflow-hidden rounded-[10px] border border-line bg-inset"
const header =
  "flex h-10 items-center justify-between gap-2 border-b border-line pl-3 pr-1.5"
const pre =
  "m-0 overflow-x-auto p-3 font-mono text-[12px] leading-5 text-ink [tab-size:2]"

/** Mono code with a copy button; pass `snippets` for language tabs. */
export const Root = forwardRef<HTMLDivElement, CodeBlockProps>(
  function CodeBlock(props, ref): ReactElement {
    if ("snippets" in props) {
      const {
        snippets,
        language,
        defaultLanguage,
        onLanguageChange,
        className,
        ...rest
      } = props
      return (
        <Tabbed
          ref={ref}
          snippets={snippets}
          className={className}
          {...(language === undefined ? {} : { language })}
          {...(defaultLanguage === undefined ? {} : { defaultLanguage })}
          {...(onLanguageChange === undefined ? {} : { onLanguageChange })}
          {...rest}
        />
      )
    }
    const { code, title, className, ...rest } = props
    return (
      <div ref={ref} className={cn(frame, className)} {...rest}>
        <div className={header}>
          <span className="truncate font-mono text-[11px] text-secondary">
            {title ?? ""}
          </span>
          <CopyButton value={code} label={title ? `${title} code` : "code"} />
        </div>
        {/* biome-ignore lint/a11y/noNoninteractiveTabindex: scrollable region must be keyboard reachable */}
        <pre tabIndex={0} className={pre}>
          <code>{code}</code>
        </pre>
      </div>
    )
  },
)
Root.displayName = ROOT_NAME

type TabbedProps = FrameProps &
  TabbedSource & { className?: string | undefined }

const Tabbed = forwardRef<HTMLDivElement, TabbedProps>(function CodeBlockTabs(
  { snippets, language, defaultLanguage, onLanguageChange, className, ...rest },
  ref,
): ReactElement {
  const [internal, setInternal] = useState(
    defaultLanguage ?? snippets[0].language,
  )
  const active = language ?? internal
  const current =
    snippets.find((snippet) => snippet.language === active) ?? snippets[0]

  function change(next: string): void {
    setInternal(next)
    onLanguageChange?.(next)
  }

  return (
    <TabsPrimitive.Root
      ref={ref}
      value={current.language}
      onValueChange={change}
      className={cn(frame, className)}
      {...rest}
    >
      <div className={header}>
        <TabsPrimitive.List
          aria-label="Language"
          className="-mb-px flex h-full min-w-0 gap-4 overflow-x-auto"
        >
          {snippets.map((snippet) => (
            <TabsPrimitive.Trigger
              key={snippet.language}
              value={snippet.language}
              className="relative inline-flex h-full shrink-0 items-center text-[12px] font-550 text-secondary transition-colors after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-transparent hover:text-ink data-[state=active]:font-600 data-[state=active]:text-ink data-[state=active]:after:bg-ink"
            >
              {snippet.label}
            </TabsPrimitive.Trigger>
          ))}
        </TabsPrimitive.List>
        <CopyButton value={current.code} label={`${current.label} code`} />
      </div>
      {snippets.map((snippet) => (
        <TabsPrimitive.Content
          key={snippet.language}
          value={snippet.language}
          className={pre}
          asChild
        >
          <pre>
            <code>{snippet.code}</code>
          </pre>
        </TabsPrimitive.Content>
      ))}
    </TabsPrimitive.Root>
  )
})
