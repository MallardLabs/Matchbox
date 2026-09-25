import Button from "@/components/ui/Button"
import { cn } from "@/lib/cn"
import type { GaugeProfile } from "@/lib/supabase"
import { Check, UserCog } from "lucide-react"
import type { ReactElement } from "react"

type GaugeHeaderProps = {
  address: string
  name: string
  profile: GaugeProfile | undefined
  isAlive: boolean
  watching: boolean
  isOwner: boolean
  onToggleWatch: () => void
  onAddIncentives: () => void
  onManageProfile: () => void
}

function safeExternalUrl(value: string | null | undefined): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.toString()
      : null
  } catch {
    return null
  }
}

const actionClass = "h-9 w-[148px] text-[13px] font-650"

/** Pen "Gauge header": avatar, identity chips, tags, links, and the stacked action column. */
export default function GaugeHeader({
  address,
  name,
  profile,
  isAlive,
  watching,
  isOwner,
  onToggleWatch,
  onAddIncentives,
  onManageProfile,
}: GaugeHeaderProps): ReactElement {
  const initial = profile
    ? name.slice(0, 1).toUpperCase()
    : address.slice(2, 4).toUpperCase()
  const links = [
    { label: "Website", href: safeExternalUrl(profile?.website_url) },
    { label: "X", href: safeExternalUrl(profile?.social_links?.twitter) },
    { label: "Discord", href: safeExternalUrl(profile?.social_links?.discord) },
  ].filter((link): link is { label: string; href: string } => !!link.href)

  return (
    <header className="flex flex-col gap-5 py-1 md:flex-row md:items-start">
      {profile?.profile_picture_url ? (
        <img
          src={profile.profile_picture_url}
          alt=""
          className="size-[88px] shrink-0 rounded-[20px] object-cover"
        />
      ) : (
        <span
          aria-hidden="true"
          className="flex size-[88px] shrink-0 items-center justify-center rounded-[20px] bg-ink text-[32px] font-[800] text-accent-soft-2"
        >
          {initial}
        </span>
      )}

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-balance text-[28px] font-650 leading-tight text-ink">
            {name}
          </h1>
          {profile?.vebtc_token_id ? (
            <span className="inline-flex h-[22px] items-center rounded-[5px] bg-accent-soft px-2 font-mono text-[11px] font-500 text-accent-ink">
              #{profile.vebtc_token_id}
            </span>
          ) : null}
          <span
            className={cn(
              "inline-flex h-[22px] items-center rounded-[5px] px-2 text-[11px] font-650",
              isAlive ? "bg-pos/10 text-pos" : "bg-inset text-muted",
            )}
          >
            {isAlive ? "Active" : "Inactive"}
          </span>
          {profile ? null : (
            <span className="inline-flex h-[22px] items-center rounded-[5px] bg-inset px-2 text-[11px] font-650 text-secondary">
              Unclaimed
            </span>
          )}
        </div>
        {profile?.description ? (
          <p className="max-w-3xl text-pretty text-[14px] font-500 text-secondary">
            {profile.description}
          </p>
        ) : null}
        {profile?.tags?.length ? (
          <ul className="flex flex-wrap gap-1.5">
            {profile.tags.map((tag) => (
              <li
                key={tag}
                className="inline-flex h-6 items-center rounded-xl bg-inset px-2.5 text-[12px] font-500 text-secondary"
              >
                {tag}
              </li>
            ))}
          </ul>
        ) : null}
        {links.length > 0 ? (
          <ul className="-ml-2.5 flex flex-wrap gap-1.5">
            {links.map((link) => (
              <li key={link.label}>
                <a
                  href={link.href}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-7 items-center rounded-[7px] px-2.5 text-[12px] font-650 text-secondary transition-colors hover:bg-inset hover:text-ink"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        ) : null}
        {profile ? null : (
          <p className="break-all font-mono text-[11px] text-muted">
            {address}
          </p>
        )}
      </div>

      <div className="flex shrink-0 flex-wrap gap-2 md:flex-col">
        <Button
          variant="ghost"
          aria-pressed={watching}
          onClick={onToggleWatch}
          className={cn(actionClass, "bg-inset")}
        >
          {watching ? (
            <Check aria-hidden="true" size={14} strokeWidth={2} />
          ) : null}
          {watching ? "Watching" : "Watch"}
        </Button>
        <a
          href={`/vote?gauge=${encodeURIComponent(address)}`}
          className={cn(
            actionClass,
            "inline-flex items-center justify-center rounded-[7px] bg-accent-soft text-accent-ink transition-colors hover:bg-accent-soft-2",
          )}
        >
          Add to ballot
        </a>
        <Button
          onClick={onAddIncentives}
          className={cn(actionClass, "font-700")}
        >
          Add incentives
        </Button>
        {isOwner ? (
          <Button
            variant="ghost"
            onClick={onManageProfile}
            className={cn(actionClass, "text-ink-2")}
          >
            <UserCog aria-hidden="true" size={14} strokeWidth={1.75} />
            Manage profile
          </Button>
        ) : null}
      </div>
    </header>
  )
}
