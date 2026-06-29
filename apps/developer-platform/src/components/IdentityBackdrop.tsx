export function IdentityBackdrop(): JSX.Element {
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 size-full text-stone-300"
      viewBox="0 0 1440 900"
      fill="none"
      preserveAspectRatio="xMidYMid slice"
    >
      <path d="M-120 315C280 115 1110 100 1570 355" stroke="currentColor" />
      <path d="M-150 495C310 275 1090 280 1580 510" stroke="currentColor" />
      <path d="M-110 675C390 465 1070 480 1560 690" stroke="currentColor" />
      <rect x="246" y="224" width="42" height="42" rx="10" fill="#F7931A" />
      <rect x="1115" y="398" width="42" height="42" rx="10" fill="#171717" />
      <circle cx="1280" cy="220" r="19" fill="#fff" stroke="currentColor" />
    </svg>
  )
}
