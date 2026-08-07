import type { GaugeProfile, SocialLinks } from "@/config/supabase"
import {
  useUploadProfilePicture,
  useUpsertGaugeProfile,
} from "@/hooks/useGaugeProfiles"
import { Button, Input, Textarea } from "@mezo-org/mezo-clay"
import { useEffect, useState } from "react"
import type { Address } from "viem"

type GaugeProfileEditorProps = {
  gaugeAddress: Address
  veBtcTokenId: bigint
  signerAddress: Address
  profile: GaugeProfile | null
  onSaved: () => void
  onCancel: () => void
}

type ProfileFields = {
  displayName: string
  description: string
  website: string
  twitter: string
  discord: string
  telegram: string
  github: string
  medium: string
  other: string
  incentiveStrategy: string
  votingStrategy: string
  tags: string
  avatar: string
}

const EMPTY_FIELDS: ProfileFields = {
  displayName: "",
  description: "",
  website: "",
  twitter: "",
  discord: "",
  telegram: "",
  github: "",
  medium: "",
  other: "",
  incentiveStrategy: "",
  votingStrategy: "",
  tags: "",
  avatar: "",
}

function fieldsFromProfile(profile: GaugeProfile | null): ProfileFields {
  if (!profile) return EMPTY_FIELDS
  return {
    displayName: profile.display_name ?? "",
    description: profile.description ?? "",
    website: profile.website_url ?? "",
    twitter: profile.social_links?.twitter ?? "",
    discord: profile.social_links?.discord ?? "",
    telegram: profile.social_links?.telegram ?? "",
    github: profile.social_links?.github ?? "",
    medium: profile.social_links?.medium ?? "",
    other: profile.social_links?.other ?? "",
    incentiveStrategy: profile.incentive_strategy ?? "",
    votingStrategy: profile.voting_strategy ?? "",
    tags: profile.tags?.join(", ") ?? "",
    avatar: profile.profile_picture_url ?? "",
  }
}

function nullable(value: string): string | null {
  return value.trim() || null
}

function validLink(value: string): boolean {
  if (!value.trim()) return true
  try {
    const url = new URL(value)
    return url.protocol === "https:" || url.protocol === "http:"
  } catch {
    return false
  }
}

export function GaugeProfileEditor({
  gaugeAddress,
  veBtcTokenId,
  signerAddress,
  profile,
  onSaved,
  onCancel,
}: GaugeProfileEditorProps): JSX.Element {
  const [fields, setFields] = useState<ProfileFields>(() =>
    fieldsFromProfile(profile),
  )
  const [validationError, setValidationError] = useState<string>()
  const profileMutation = useUpsertGaugeProfile()
  const avatarMutation = useUploadProfilePicture()

  useEffect(() => setFields(fieldsFromProfile(profile)), [profile])

  function update(field: keyof ProfileFields, value: string): void {
    setFields((current) => ({ ...current, [field]: value }))
  }

  async function uploadAvatar(file: File | undefined): Promise<void> {
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      setValidationError("Avatar images must be 5 MB or smaller")
      return
    }
    const url = await avatarMutation.uploadPicture(
      gaugeAddress,
      veBtcTokenId,
      signerAddress,
      file,
    )
    if (url) update("avatar", url)
  }

  async function save(): Promise<void> {
    const links = [
      fields.website,
      fields.twitter,
      fields.discord,
      fields.telegram,
      fields.github,
      fields.medium,
      fields.other,
    ]
    if (!links.every(validLink)) {
      setValidationError("Links must use a valid http:// or https:// URL")
      return
    }

    setValidationError(undefined)
    const socialLinks: SocialLinks = {
      ...(nullable(fields.twitter) ? { twitter: fields.twitter.trim() } : {}),
      ...(nullable(fields.discord) ? { discord: fields.discord.trim() } : {}),
      ...(nullable(fields.telegram)
        ? { telegram: fields.telegram.trim() }
        : {}),
      ...(nullable(fields.github) ? { github: fields.github.trim() } : {}),
      ...(nullable(fields.medium) ? { medium: fields.medium.trim() } : {}),
      ...(nullable(fields.other) ? { other: fields.other.trim() } : {}),
    }
    const tags = fields.tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean)
      .slice(0, 12)
    const saved = await profileMutation.upsertProfile({
      gaugeAddress,
      veBTCTokenId: veBtcTokenId,
      ownerAddress: signerAddress,
      displayName: nullable(fields.displayName),
      profilePictureUrl: nullable(fields.avatar),
      description: nullable(fields.description),
      websiteUrl: nullable(fields.website),
      socialLinks: Object.keys(socialLinks).length > 0 ? socialLinks : null,
      incentiveStrategy: nullable(fields.incentiveStrategy),
      votingStrategy: nullable(fields.votingStrategy),
      tags: tags.length > 0 ? tags : null,
    })
    if (saved) onSaved()
  }

  const linkFields: Array<[keyof ProfileFields, string]> = [
    ["website", "Website"],
    ["twitter", "Twitter / X"],
    ["discord", "Discord"],
    ["telegram", "Telegram"],
    ["github", "GitHub"],
    ["medium", "Medium"],
    ["other", "Other link"],
  ]

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault()
        void save()
      }}
    >
      <fieldset>
        <legend className="mb-3 text-sm font-semibold text-[var(--content-primary)]">
          Identity
        </legend>
        <ol className="grid gap-4 md:grid-cols-2">
          <li>
            <label htmlFor="gauge-display-name" className="mb-1 block text-xs">
              Display name
            </label>
            <Input
              id="gauge-display-name"
              value={fields.displayName}
              onChange={(event) => update("displayName", event.target.value)}
              maxLength={80}
            />
          </li>
          <li>
            <label htmlFor="gauge-avatar" className="mb-1 block text-xs">
              Profile picture
            </label>
            <input
              id="gauge-avatar"
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              onChange={(event) => void uploadAvatar(event.target.files?.[0])}
              className="block w-full text-xs text-[var(--content-secondary)]"
            />
          </li>
          <li className="md:col-span-2">
            <label htmlFor="gauge-description" className="mb-1 block text-xs">
              Description
            </label>
            <Textarea
              id="gauge-description"
              value={fields.description}
              onChange={(event) => update("description", event.target.value)}
              maxLength={2000}
            />
          </li>
        </ol>
      </fieldset>

      <fieldset>
        <legend className="mb-3 text-sm font-semibold text-[var(--content-primary)]">
          Links
        </legend>
        <ol className="grid gap-3 md:grid-cols-2">
          {linkFields.map(([field, label]) => (
            <li key={field}>
              <label htmlFor={`gauge-${field}`} className="mb-1 block text-xs">
                {label}
              </label>
              <Input
                id={`gauge-${field}`}
                value={fields[field]}
                onChange={(event) => update(field, event.target.value)}
                placeholder="https://"
              />
            </li>
          ))}
        </ol>
      </fieldset>

      <fieldset>
        <legend className="mb-3 text-sm font-semibold text-[var(--content-primary)]">
          Strategy
        </legend>
        <ol className="flex flex-col gap-3">
          <li>
            <label
              htmlFor="gauge-incentive-strategy"
              className="mb-1 block text-xs"
            >
              Incentive strategy
            </label>
            <Textarea
              id="gauge-incentive-strategy"
              value={fields.incentiveStrategy}
              onChange={(event) =>
                update("incentiveStrategy", event.target.value)
              }
              maxLength={2000}
            />
          </li>
          <li>
            <label
              htmlFor="gauge-voting-strategy"
              className="mb-1 block text-xs"
            >
              Voting strategy
            </label>
            <Textarea
              id="gauge-voting-strategy"
              value={fields.votingStrategy}
              onChange={(event) => update("votingStrategy", event.target.value)}
              maxLength={2000}
            />
          </li>
          <li>
            <label htmlFor="gauge-tags" className="mb-1 block text-xs">
              Tags (comma separated)
            </label>
            <Input
              id="gauge-tags"
              value={fields.tags}
              onChange={(event) => update("tags", event.target.value)}
            />
          </li>
        </ol>
      </fieldset>

      {(validationError || profileMutation.error || avatarMutation.error) && (
        <p role="alert" className="text-pretty text-xs text-[var(--negative)]">
          {validationError ??
            profileMutation.error?.message ??
            avatarMutation.error?.message}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" kind="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={profileMutation.isLoading || avatarMutation.isLoading}
        >
          {profileMutation.isLoading || avatarMutation.isLoading
            ? "Saving..."
            : "Save profile"}
        </Button>
      </div>
    </form>
  )
}
