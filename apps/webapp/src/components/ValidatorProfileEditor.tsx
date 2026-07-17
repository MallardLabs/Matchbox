import type { ValidatorProfile } from "@/config/supabase"
import {
  type ValidatorProfileValues,
  useUpsertValidatorProfile,
} from "@/hooks/useValidatorProfiles"
import { Button, Input, Textarea } from "@mezo-org/mezo-clay"
import { useEffect, useState } from "react"
import type { Address } from "viem"

type Props = {
  gaugeAddress: Address
  operatorAddress: Address
  editorAddress: Address
  profile: ValidatorProfile | null
  onSaved: () => void
  onCancel: () => void
}

type Fields = {
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

const EMPTY_FIELDS: Fields = {
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

function fieldsFromProfile(profile: ValidatorProfile | null): Fields {
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

export default function ValidatorProfileEditor({
  gaugeAddress,
  operatorAddress,
  editorAddress,
  profile,
  onSaved,
  onCancel,
}: Props): JSX.Element {
  const [fields, setFields] = useState<Fields>(() => fieldsFromProfile(profile))
  const [validationError, setValidationError] = useState<string>()
  const mutation = useUpsertValidatorProfile()
  const identity = { gaugeAddress, operatorAddress, editorAddress }

  useEffect(() => setFields(fieldsFromProfile(profile)), [profile])

  function update(field: keyof Fields, value: string) {
    setFields((current) => ({ ...current, [field]: value }))
  }

  async function uploadAvatar(file: File | undefined) {
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      setValidationError("Avatar images must be 5 MB or smaller")
      return
    }
    const url = await mutation.uploadAvatar(identity, file)
    if (url) update("avatar", url)
  }

  async function save() {
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
    const socialLinks = {
      ...(nullable(fields.twitter) ? { twitter: fields.twitter.trim() } : {}),
      ...(nullable(fields.discord) ? { discord: fields.discord.trim() } : {}),
      ...(nullable(fields.telegram)
        ? { telegram: fields.telegram.trim() }
        : {}),
      ...(nullable(fields.github) ? { github: fields.github.trim() } : {}),
      ...(nullable(fields.medium) ? { medium: fields.medium.trim() } : {}),
      ...(nullable(fields.other) ? { other: fields.other.trim() } : {}),
    }
    const values: ValidatorProfileValues = {
      displayName: nullable(fields.displayName),
      profilePictureUrl: nullable(fields.avatar),
      description: nullable(fields.description),
      websiteUrl: nullable(fields.website),
      socialLinks: Object.values(socialLinks).some(Boolean)
        ? socialLinks
        : null,
      incentiveStrategy: nullable(fields.incentiveStrategy),
      votingStrategy: nullable(fields.votingStrategy),
      tags:
        fields.tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean)
          .slice(0, 12) || null,
    }
    if (values.tags?.length === 0) values.tags = null
    const saved = await mutation.upsertProfile(identity, values)
    if (saved) onSaved()
  }

  const linkFields: Array<[keyof Fields, string]> = [
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
          Validator profile
        </legend>
        <ol className="grid gap-4 md:grid-cols-2">
          <li>
            <label
              htmlFor="validator-display-name"
              className="mb-1 block text-xs"
            >
              Display name
            </label>
            <Input
              id="validator-display-name"
              value={fields.displayName}
              onChange={(event) => update("displayName", event.target.value)}
              maxLength={80}
            />
          </li>
          <li>
            <label htmlFor="validator-avatar" className="mb-1 block text-xs">
              Profile picture
            </label>
            <input
              id="validator-avatar"
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              onChange={(event) => void uploadAvatar(event.target.files?.[0])}
              className="block w-full text-xs text-[var(--content-secondary)]"
            />
          </li>
          <li className="md:col-span-2">
            <label
              htmlFor="validator-description"
              className="mb-1 block text-xs"
            >
              Description
            </label>
            <Textarea
              id="validator-description"
              value={fields.description}
              onChange={(event) => update("description", event.target.value)}
              maxLength={1200}
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
              <label
                htmlFor={`validator-${field}`}
                className="mb-1 block text-xs"
              >
                {label}
              </label>
              <Input
                id={`validator-${field}`}
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
              htmlFor="validator-incentive-strategy"
              className="mb-1 block text-xs"
            >
              Incentive strategy
            </label>
            <Textarea
              id="validator-incentive-strategy"
              value={fields.incentiveStrategy}
              onChange={(event) =>
                update("incentiveStrategy", event.target.value)
              }
              maxLength={2000}
            />
          </li>
          <li>
            <label
              htmlFor="validator-voting-strategy"
              className="mb-1 block text-xs"
            >
              Voting strategy
            </label>
            <Textarea
              id="validator-voting-strategy"
              value={fields.votingStrategy}
              onChange={(event) => update("votingStrategy", event.target.value)}
              maxLength={2000}
            />
          </li>
          <li>
            <label htmlFor="validator-tags" className="mb-1 block text-xs">
              Tags (comma separated)
            </label>
            <Input
              id="validator-tags"
              value={fields.tags}
              onChange={(event) => update("tags", event.target.value)}
            />
          </li>
        </ol>
      </fieldset>
      {(validationError || mutation.error) && (
        <p className="text-pretty text-xs text-[var(--negative)]">
          {validationError ?? mutation.error?.message}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" kind="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={mutation.isLoading}>
          {mutation.isLoading ? "Saving..." : "Save profile"}
        </Button>
      </div>
    </form>
  )
}
