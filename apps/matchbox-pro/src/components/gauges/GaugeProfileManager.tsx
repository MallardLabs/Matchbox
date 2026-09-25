import Button from "@/components/ui/Button"
import Sheet from "@/components/ui/Sheet"
import { useProfileWrite } from "@/hooks/useProfileWrite"
import { cn } from "@/lib/cn"
import { getContractConfig } from "@/lib/contracts"
import { useNetwork } from "@/lib/network"
import type { GaugeProfile, SocialLinks } from "@/lib/supabase"
import { type ReactElement, type ReactNode, useState } from "react"
import type { Address } from "viem"
import { useAccount, useWriteContract } from "wagmi"

const LINK_OPTIONS = [
  { key: "website", label: "Website" },
  { key: "twitter", label: "X" },
  { key: "discord", label: "Discord" },
  { key: "telegram", label: "Telegram" },
  { key: "github", label: "GitHub" },
  { key: "medium", label: "Medium" },
  { key: "other", label: "Other" },
] as const

type LinkKey = (typeof LINK_OPTIONS)[number]["key"]
type SocialKey = Exclude<LinkKey, "website">

const sectionClass = "text-[11px] font-650 uppercase text-muted"
const labelClass = "text-[11px] font-500 text-muted"
const inputClass =
  "w-full rounded-lg bg-inset px-2.5 py-2 text-[13px] font-500 text-ink outline-none ring-accent/40 placeholder:text-faint focus-visible:ring-2"
const chipClass =
  "inline-flex h-7 items-center rounded-[14px] px-2.5 text-[12px] font-650"

type GaugeProfileManagerProps = {
  gaugeAddress: Address
  profile: GaugeProfile
  onClose: () => void
  onSaved: (message: string) => void
}

/** Pen J09 / 13c "Manage profile" bottom sheet for the gauge's claimed owner. */
export default function GaugeProfileManager({
  gaugeAddress,
  profile,
  onClose,
  onSaved,
}: GaugeProfileManagerProps): ReactElement {
  const { address: owner } = useAccount()
  const { chainId } = useNetwork()
  const profileWrite = useProfileWrite()
  const { writeContractAsync, isPending: refreshing } = useWriteContract()
  const [name, setName] = useState(profile.display_name ?? "")
  const [description, setDescription] = useState(profile.description ?? "")
  const [website, setWebsite] = useState(profile.website_url ?? "")
  const [socialLinks, setSocialLinks] = useState<SocialLinks>(
    profile.social_links ?? {},
  )
  const [tags, setTags] = useState<string[]>(profile.tags ?? [])
  const [tagDraft, setTagDraft] = useState("")
  const [shownLinks, setShownLinks] = useState<LinkKey[]>(() =>
    LINK_OPTIONS.filter(({ key }) =>
      key === "website"
        ? Boolean(profile.website_url)
        : Boolean(profile.social_links?.[key]?.trim()),
    ).map(({ key }) => key),
  )

  function linkValue(key: LinkKey): string {
    return key === "website" ? website : (socialLinks[key as SocialKey] ?? "")
  }

  function setLinkValue(key: LinkKey, value: string): void {
    if (key === "website") setWebsite(value)
    else setSocialLinks((previous) => ({ ...previous, [key]: value }))
  }

  function addTag(raw: string): void {
    const next = raw.trim().slice(0, 40)
    if (!next) return
    setTags((previous) =>
      previous.length >= 12 || previous.includes(next)
        ? previous
        : [...previous, next],
    )
  }

  function save(): void {
    if (!owner) return
    void profileWrite
      .save({
        gaugeAddress,
        veBtcTokenId: profile.vebtc_token_id,
        ownerAddress: owner,
        fields: {
          displayName: name,
          description,
          websiteUrl: website,
          tags,
          socialLinks,
        },
      })
      .then((ok) => {
        if (!ok) return
        onSaved("Profile saved")
        onClose()
      })
  }

  function refreshBoost(): void {
    void writeContractAsync({
      ...getContractConfig(chainId).boostVoter,
      functionName: "pokeBoost",
      args: [BigInt(profile.vebtc_token_id)],
    }).then(() => onSaved("Boost refreshed"))
  }

  const initial = (name || profile.gauge_address.slice(2, 3)).slice(0, 1)

  return (
    <Sheet
      open
      onOpenChange={(next) => {
        if (!next && !profileWrite.busy) onClose()
      }}
      title="Manage profile"
      description={`veBTC #${profile.vebtc_token_id}${owner ? ` · ${owner.slice(0, 6)}…${owner.slice(-4)}` : ""}`}
      size="medium"
    >
      <form
        className="flex flex-col gap-3.5"
        onSubmit={(event) => {
          event.preventDefault()
          save()
        }}
      >
        <h3 className={sectionClass}>Identity</h3>
        <div className="flex items-center gap-3.5">
          {profile.profile_picture_url ? (
            <img
              src={profile.profile_picture_url}
              alt=""
              className="size-16 shrink-0 rounded-full object-cover"
            />
          ) : (
            <span
              aria-hidden="true"
              className="flex size-16 shrink-0 items-center justify-center rounded-full bg-ink text-[22px] font-[800] uppercase text-accent-soft-2"
            >
              {initial}
            </span>
          )}
          <Field id="profile-name" label="Display name" className="flex-1">
            <input
              id="profile-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className={cn(inputClass, "h-9")}
            />
          </Field>
        </div>
        <Field id="profile-description" label="Description">
          <textarea
            id="profile-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className={cn(inputClass, "h-[72px] resize-y")}
          />
        </Field>

        <h3 className={sectionClass}>Links</h3>
        <ul className="flex flex-wrap gap-1.5">
          {LINK_OPTIONS.map(({ key, label }) => {
            const shown = shownLinks.includes(key)
            return (
              <li key={key}>
                <button
                  type="button"
                  aria-pressed={shown}
                  onClick={() =>
                    setShownLinks((previous) =>
                      previous.includes(key) ? previous : [...previous, key],
                    )
                  }
                  className={cn(
                    chipClass,
                    shown
                      ? "bg-accent-soft text-accent-ink"
                      : "bg-inset text-secondary hover:text-ink",
                  )}
                >
                  {shown ? label : `+ ${label}`}
                </button>
              </li>
            )
          })}
        </ul>
        {LINK_OPTIONS.filter(({ key }) => shownLinks.includes(key)).map(
          ({ key, label }) => (
            <Field key={key} id={`profile-link-${key}`} label={label}>
              <input
                id={`profile-link-${key}`}
                type="url"
                inputMode="url"
                placeholder="https://"
                value={linkValue(key)}
                onChange={(event) => setLinkValue(key, event.target.value)}
                className={cn(inputClass, "h-9")}
              />
            </Field>
          ),
        )}

        <h3 className={sectionClass}>Tags</h3>
        <ul className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <li key={tag}>
              <button
                type="button"
                aria-label={`Remove tag ${tag}`}
                onClick={() =>
                  setTags((previous) => previous.filter((item) => item !== tag))
                }
                className={cn(
                  chipClass,
                  "gap-2 bg-accent-soft text-accent-ink hover:bg-accent-soft-2",
                )}
              >
                {tag}
                <span aria-hidden="true">×</span>
              </button>
            </li>
          ))}
          <li>
            <input
              aria-label="Add a tag"
              placeholder="+ Add tag"
              value={tagDraft}
              onChange={(event) => {
                const parts = event.target.value.split(",")
                const last = parts.pop() ?? ""
                for (const part of parts) addTag(part)
                setTagDraft(last)
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return
                event.preventDefault()
                addTag(tagDraft)
                setTagDraft("")
              }}
              className={cn(
                chipClass,
                "w-28 bg-inset text-ink outline-none ring-accent/40 placeholder:text-secondary focus-visible:ring-2",
              )}
            />
          </li>
        </ul>

        {profileWrite.error ? (
          <p role="alert" className="text-[13px] text-neg">
            {profileWrite.error}
          </p>
        ) : null}
        <div className="flex items-center gap-2 pt-1.5">
          <Button
            variant="ghost"
            disabled={refreshing}
            onClick={refreshBoost}
            className="h-9 text-[13px]"
          >
            {refreshing ? "Refreshing…" : "Refresh boost"}
          </Button>
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={profileWrite.busy}
            className="ml-auto h-9 bg-inset px-3.5 text-[13px] font-650"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={profileWrite.busy || !owner}
            className="h-9 text-[13px]"
          >
            {profileWrite.busy ? "Saving…" : "Save profile"}
          </Button>
        </div>
      </form>
    </Sheet>
  )
}

function Field({
  id,
  label,
  className,
  children,
}: {
  id: string
  label: string
  className?: string
  children: ReactNode
}): ReactElement {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      {children}
    </div>
  )
}
