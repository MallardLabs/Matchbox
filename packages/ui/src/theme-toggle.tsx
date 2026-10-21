import { Monitor, Moon, Sun } from "lucide-react"
import { type ReactElement, forwardRef } from "react"
import { cn } from "./cn"
import { type ThemePreference, useTheme } from "./theme"

const ROOT_NAME = "ThemeToggle"

const options: Array<{
  value: ThemePreference
  label: string
  icon: ReactElement
}> = [
  {
    value: "system",
    label: "System theme",
    icon: <Monitor aria-hidden="true" size={16} strokeWidth={1.75} />,
  },
  {
    value: "light",
    label: "Light theme",
    icon: <Sun aria-hidden="true" size={16} strokeWidth={1.75} />,
  },
  {
    value: "dark",
    label: "Dark theme",
    icon: <Moon aria-hidden="true" size={16} strokeWidth={1.75} />,
  },
]

export type ThemeToggleProps = {
  className?: string
}

/** Pro sidebar theme switch; requires ThemeProvider. */
export const Root = forwardRef<HTMLFieldSetElement, ThemeToggleProps>(
  function ThemeToggle({ className }, ref): ReactElement {
    const { preference, setPreference } = useTheme()
    return (
      <fieldset
        ref={ref}
        className={cn(
          "m-0 flex h-9 min-w-0 gap-0.5 rounded-lg border-0 bg-inset-2 p-[3px]",
          className,
        )}
      >
        <legend className="sr-only">Theme</legend>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-label={option.label}
            aria-pressed={preference === option.value}
            onClick={() => setPreference(option.value)}
            className={cn(
              "flex h-[30px] w-9 items-center justify-center rounded-md transition-colors",
              preference === option.value
                ? "bg-surface text-ink shadow-knob"
                : "text-secondary hover:text-ink",
            )}
          >
            {option.icon}
          </button>
        ))}
      </fieldset>
    )
  },
)
Root.displayName = ROOT_NAME
