import type { GaugeProfile } from "@/lib/supabase"
import * as Badge from "@repo/ui/badge"
import * as Button from "@repo/ui/button"
import { cn } from "@repo/ui/cn"
import * as CopyField from "@repo/ui/copy-field"
import * as TokenMark from "@repo/ui/token-mark"
import { Link } from "@tanstack/react-router"
import { Check } from "lucide-react"
import type { ReactElement } from "react"
import type { Address } from "viem"

type GaugeIdentityProps = {
  address: Address
  name: string
  profile: GaugeProfile | undefined
  tokenId: string | undefined
  isAlive: boolean
  watching: boolean
  onToggleWatch: () => void
  onAddIncentives: () => void
}

type ProfileLink = { label: string; href: string }

function safeUrl(value: string | null | undefined): string | null {
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

function profileLinks(profile: GaugeProfile | undefined): ProfileLink[] {
  const social = profile?.social_links
  return [
    {
      label: "Website",
      href: safeUrl(profile?.website_url ?? social?.website),
    },
    { label: "X", href: safeUrl(social?.twitter) },
    { label: "Discord", href: safeUrl(social?.discord) },
    { label: "Telegram", href: safeUrl(social?.telegram) },
    { label: "GitHub", href: safeUrl(social?.github) },
  ].flatMap((link) =>
    link.href ? [{ label: link.label, href: link.href }] : [],
  )
}

const RESPONSIVE_TILE = {
  width: undefined,
  height: undefined,
  fontSize: undefined,
} as const

const actionClass = "h-9 w-full rounded-[7px] px-3 text-body-sm md:w-[148px]"

/** Pen J07 "Gauge header": identity tile, chips, profile copy, actions. */
export default function GaugeIdentity({
  address,
  name,
  profile,
  tokenId,
  isAlive,
  watching,
  onToggleWatch,
  onAddIncentives,
}: GaugeIdentityProps): ReactElement {
  const links = profileLinks(profile)
  const description = profile?.description?.trim()
  const tags = (profile?.tags ?? []).filter((tag) => tag.trim() !== "")

  return (
    <header className="flex flex-col gap-5 py-1 md:flex-row md:items-start">
      <div className="flex min-w-0 flex-1 items-start gap-4 md:gap-5">
        {profile?.profile_picture_url ? (
          <img
            src={profile.profile_picture_url}
            alt=""
            width={88}
            height={88}
            className="size-16 shrink-0 rounded-2xl bg-inset object-cover md:size-[88px] md:rounded-[20px]"
          />
        ) : (
          <TokenMark.Monogram
            name={name}
            seed={address}
            // Sized by class so one tile serves phone (64) and desktop (88).
            style={RESPONSIVE_TILE}
            className="size-16 rounded-2xl text-[24px] font-700 md:size-[88px] md:rounded-[20px] md:text-[32px]"
          />
        )}

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <h1 className="min-w-0 break-words text-[24px] font-400 leading-[30px] text-ink md:text-title md:font-400">
              {name}
            </h1>
            {tokenId ? (
              <Badge.Root tone="accent" mono className="font-700">
                #{tokenId}
              </Badge.Root>
            ) : null}
            <Badge.Root tone={isAlive ? "pos" : "neutral"} className="font-500">
              {isAlive ? "Active" : "Inactive"}
            </Badge.Root>
            {profile ? null : (
              <Badge.Root tone="neutral" className="font-500">
                Unclaimed profile
              </Badge.Root>
            )}
          </div>

          {description ? (
            <p className="m-0 max-w-3xl text-pretty text-body font-500 text-secondary">
              {description}
            </p>
          ) : null}

          {profile ? null : (
            // The name is already the short address; this is the full one.
            <CopyField.Root
              value={address}
              label="gauge address"
              size="sm"
              className="max-w-[440px]"
            />
          )}

          {tags.length > 0 ? (
            <ul
              aria-label="Tags"
              className="m-0 flex list-none flex-wrap gap-1.5 p-0"
            >
              {tags.map((tag) => (
                <li
                  key={tag}
                  className="inline-flex h-6 items-center rounded-xl bg-inset px-2.5 text-label font-500 text-secondary"
                >
                  {tag}
                </li>
              ))}
            </ul>
          ) : null}

          {links.length > 0 ? (
            <ul
              aria-label="Links"
              className="m-0 flex list-none flex-wrap gap-1.5 p-0"
            >
              {links.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex h-7 items-center rounded-[7px] bg-surface px-2.5 text-label font-400 text-secondary transition-colors hover:bg-inset hover:text-ink"
                  >
                    {link.label}
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>

      <div className="grid shrink-0 grid-cols-2 gap-2 md:flex md:flex-col">
        <Button.Root
          variant="ghost"
          aria-pressed={watching}
          onClick={onToggleWatch}
          className={cn(
            actionClass,
            "bg-inset font-400 text-secondary hover:bg-inset-2",
          )}
        >
          {watching ? (
            <Check aria-hidden="true" size={14} strokeWidth={2} />
          ) : null}
          {watching ? "Watching" : "Watch"}
        </Button.Root>
        {isAlive ? (
          <Button.Root
            asChild
            variant="soft"
            className={cn(actionClass, "font-400")}
          >
            <Link to="/vote" search={{ add: address }}>
              Add to ballot
            </Link>
          </Button.Root>
        ) : (
          <Button.Root
            variant="soft"
            disabled
            className={cn(actionClass, "font-400")}
          >
            Add to ballot
          </Button.Root>
        )}
        <Button.Root
          onClick={onAddIncentives}
          disabled={!isAlive}
          className={cn(actionClass, "col-span-2 font-700")}
        >
          Add incentives
        </Button.Root>
      </div>
    </header>
  )
}
