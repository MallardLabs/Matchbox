import { useTheme } from "@/contexts/ThemeContext"

export function ThemePicker(): JSX.Element {
  const { theme, setTheme } = useTheme()
  return (
    <label className="inline-flex items-center gap-2 text-sm font-medium text-stone-600 dark:text-stone-300">
      <span>Theme</span>
      <select
        aria-label="Choose theme"
        className="min-h-9 rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm font-semibold text-ink focus:border-brand focus:outline-none dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
        value={theme}
        onChange={(event) => setTheme(event.target.value as "light" | "dark")}
      >
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>
  )
}
