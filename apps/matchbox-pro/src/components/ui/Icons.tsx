import type { SVGProps } from "react"

type IconProps = SVGProps<SVGSVGElement>

function IconBase({ children, ...props }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      focusable="false"
      viewBox="0 0 24 24"
      {...props}
    >
      {children}
    </svg>
  )
}

export function SearchIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="m16.4 16.4 4 4"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
    </IconBase>
  )
}

export function HomeIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path
        d="m4 10 8-6 8 6v9a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1v-9Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    </IconBase>
  )
}

export function VoteIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path
        d="m7 4 5-2 5 2v6c0 4-2.1 7.2-5 9-2.9-1.8-5-5-5-9V4Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
      <path
        d="m9.5 10.3 1.7 1.7 3.6-4"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    </IconBase>
  )
}

export function RewardsIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path
        d="M5 10h14v10H5zM4 7.5h16V10H4zM12 7v13M12 7H8.8A2.3 2.3 0 1 1 12 4.9V7Zm0 0h3.2A2.3 2.3 0 1 0 12 4.9V7Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
    </IconBase>
  )
}

export function GaugeIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path
        d="M4 18a8 8 0 1 1 16 0"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.7"
      />
      <path
        d="m12 14 4-4M6 18h12"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.7"
      />
    </IconBase>
  )
}

export function MoreIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="5" cy="12" fill="currentColor" r="1.4" />
      <circle cx="12" cy="12" fill="currentColor" r="1.4" />
      <circle cx="19" cy="12" fill="currentColor" r="1.4" />
    </IconBase>
  )
}

export function WalletIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path
        d="M4 7.5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-12a2 2 0 0 1 2-2h10"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
      <path
        d="M16 12h4v4h-4a2 2 0 1 1 0-4Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    </IconBase>
  )
}

export function ArrowDownLeftIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path
        d="M18 6 6 18m0 0h9M6 18V9"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </IconBase>
  )
}

export function ArrowUpRightIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path
        d="M6 18 18 6m0 0H9m9 0v9"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </IconBase>
  )
}

export function ArrowRightIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path
        d="M4 12h15m-5-5 5 5-5 5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </IconBase>
  )
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path
        d="m7 10 5 5 5-5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </IconBase>
  )
}

export function CheckIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path
        d="m5 12.5 4 4 10-10"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.9"
      />
    </IconBase>
  )
}

export function ClockIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M12 7v5l3 2"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    </IconBase>
  )
}

export function FilterIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path
        d="M4 6h16M7 12h10M10 18h4"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.7"
      />
    </IconBase>
  )
}

export function CopyIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect
        height="12"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.6"
        width="12"
        x="8"
        y="8"
      />
      <path
        d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.6"
      />
    </IconBase>
  )
}

export function CloseIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path
        d="m6 6 12 12M18 6 6 18"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
    </IconBase>
  )
}

export function ThemeIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path
        d="M20 15.2A8 8 0 0 1 8.8 4 8.2 8.2 0 1 0 20 15.2Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    </IconBase>
  )
}

export function ShieldIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path
        d="m12 3 7 3v5c0 4.2-2.5 7.7-7 10-4.5-2.3-7-5.8-7-10V6l7-3Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
      <path
        d="m9 12 2 2 4-5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    </IconBase>
  )
}

export function BoltIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path
        d="m13.5 2-8 12H12l-1.5 8 8-12H12l1.5-8Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    </IconBase>
  )
}

export function HistoryIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path
        d="M4 12a8 8 0 1 0 2.3-5.7L4 8.6M4 4v4.6h4.6"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
      <path
        d="M12 8v4l3 2"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    </IconBase>
  )
}
