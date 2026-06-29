type PermissionRowProps = {
  allowed: boolean
  children: React.ReactNode
}

export function PermissionRow({
  allowed,
  children,
}: PermissionRowProps): JSX.Element {
  return (
    <li className="flex gap-3 border-t border-white/10 py-3 first:border-t-0">
      <span
        aria-hidden="true"
        className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
          allowed ? "bg-brand text-ink" : "border border-white/35 text-white/70"
        }`}
      >
        {allowed ? "✓" : "×"}
      </span>
      <span className="text-pretty text-sm leading-6 text-white/80">
        {children}
      </span>
    </li>
  )
}
