import type { ReactElement } from "react"

export default function XLogo({ size = 14 }: { size?: number }): ReactElement {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path
        fill="currentColor"
        d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.657l-4.714-6.231-5.401 6.231h-3.311l7.727-8.828-9.217-10.672h6.826l4.253 5.622 5.911-5.622z m-1.161 17.52h1.833l-11.832-15.644h-1.967l11.966 15.644z"
      />
    </svg>
  )
}
