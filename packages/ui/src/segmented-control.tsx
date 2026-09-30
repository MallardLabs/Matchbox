import * as ToggleGroup from "@radix-ui/react-toggle-group"
import {
  type ComponentPropsWithoutRef,
  type ElementRef,
  type ReactElement,
  createContext,
  forwardRef,
  useContext,
} from "react"
import { cn } from "./cn"

const ROOT_NAME = "SegmentedControl"
const ITEM_NAME = "SegmentedControlItem"

export type SegmentedControlSize = "sm" | "md"

const SizeContext = createContext<SegmentedControlSize>("md")

type SingleProps = Omit<
  ComponentPropsWithoutRef<typeof ToggleGroup.Root>,
  "type" | "value" | "defaultValue" | "onValueChange"
>

export type RootProps = SingleProps & {
  value: string
  onValueChange: (value: string) => void
  size?: SegmentedControlSize
  /** Required: the group has no visible label of its own. */
  "aria-label": string
}

/** Pro VoteTypeTabs / theme switch: inset track, raised knob for the choice. */
export const Root = forwardRef<ElementRef<typeof ToggleGroup.Root>, RootProps>(
  function SegmentedControl(
    { value, onValueChange, size = "md", className, ...props },
    ref,
  ): ReactElement {
    return (
      <SizeContext.Provider value={size}>
        <ToggleGroup.Root
          ref={ref}
          type="single"
          value={value}
          onValueChange={(next: string) => {
            if (next !== "") onValueChange(next)
          }}
          className={cn(
            "inline-flex items-center gap-0.5 bg-inset-2 p-[3px]",
            size === "md" ? "h-9 rounded-lg" : "h-[34px] rounded-[6px]",
            className,
          )}
          {...props}
        />
      </SizeContext.Provider>
    )
  },
)
Root.displayName = ROOT_NAME

export type ItemProps = ComponentPropsWithoutRef<typeof ToggleGroup.Item>

export const Item = forwardRef<ElementRef<typeof ToggleGroup.Item>, ItemProps>(
  function SegmentedControlItem({ className, ...props }, ref): ReactElement {
    const size = useContext(SizeContext)
    return (
      <ToggleGroup.Item
        ref={ref}
        className={cn(
          "inline-flex h-full items-center justify-center gap-1.5 whitespace-nowrap px-2.5 text-[12px] font-500 text-secondary transition-colors hover:text-ink disabled:pointer-events-none disabled:opacity-40 data-[state=on]:bg-surface data-[state=on]:font-600 data-[state=on]:text-ink data-[state=on]:shadow-knob",
          size === "md" ? "rounded-md" : "rounded-[5px]",
          className,
        )}
        {...props}
      />
    )
  },
)
Item.displayName = ITEM_NAME
