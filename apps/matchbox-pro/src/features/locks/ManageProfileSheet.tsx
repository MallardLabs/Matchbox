import type { SocialLinks } from "@/lib/supabase"
import { useViewer } from "@/lib/viewer"
import * as Button from "@repo/ui/button"
import { cn } from "@repo/ui/cn"
import * as Field from "@repo/ui/field"
import * as Input from "@repo/ui/input"
import * as Textarea from "@repo/ui/textarea"
import * as Toast from "@repo/ui/toast"
import { monogramInitials } from "@repo/ui/token-mark"
import { shortenAddress } from "@repo/ui/wallet-address"
import { type ReactElement, useEffect, useRef, useState } from "react"
import LockSheet, { ErrorNote } from "./LockSheet"
import type { LockView } from "./lockModel"
import {
  AVATAR_MAX_BYTES,
  AVATAR_TYPES,
  type ProfileDraft,
  useProfileSave,
} from "./useProfileSave"

const LINKS = [
  { key: "website", label: "Website" },
  { key: "twitter", label: "X" },
  { key: "discord", label: "Discord" },
  { key: "telegram", label: "Telegram" },
  { key: "github", label: "GitHub" },
  { key: "medium", label: "Medium" },
  { key: "other", label: "Other" },
] as const
type LinkKey = (typeof LINKS)[number]["key"]

const chip =
  "inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-label font-500 transition-colors"
const section =
  "m-0 pt-2 text-caption font-600 uppercase tracking-[0.06em] text-muted"
const label = "text-caption font-500 text-muted"

function validUrl(value: string): boolean {
  if (value.trim() === "") return true
  try {
    const url = new URL(value.trim())
    return url.protocol === "https:" || url.protocol === "http:"
  } catch {
    return false
  }
}

function shownLinks(links: SocialLinks, shown: LinkKey[]): SocialLinks {
  const kept: SocialLinks = {}
  for (const key of shown) {
    if (key === "website") continue
    const value = links[key]
    if (value) kept[key] = value
  }
  return kept
}

/** J09 / Pen 13c: owner-only gauge profile editor as a bottom sheet. */
export default function ManageProfileSheet({
  lock,
  onClose,
}: {
  lock: LockView
  onClose: () => void
}): ReactElement {
  const { viewer } = useViewer()
  const { toast } = Toast.useToast()
  const { save, stage, busy, error } = useProfileSave()
  const profile = lock.profile
  const [draft, setDraft] = useState<ProfileDraft>(() => ({
    displayName: profile?.display_name ?? "",
    description: profile?.description ?? "",
    websiteUrl: profile?.website_url ?? "",
    socialLinks: profile?.social_links ?? {},
    tags: profile?.tags ?? [],
    incentiveStrategy: profile?.incentive_strategy ?? "",
    votingStrategy: profile?.voting_strategy ?? "",
    profilePictureUrl: profile?.profile_picture_url ?? null,
  }))
  const [shown, setShown] = useState<LinkKey[]>(() =>
    LINKS.filter(({ key }) =>
      key === "website"
        ? Boolean(profile?.website_url)
        : Boolean(profile?.social_links?.[key]?.trim()),
    ).map(({ key }) => key),
  )
  const [tagDraft, setTagDraft] = useState("")
  const [photo, setPhoto] = useState<File | null>(null)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const owner = viewer.mode === "connected" ? viewer.address : undefined

  useEffect(() => {
    if (!photo) {
      setPreview(null)
      return
    }
    const url = URL.createObjectURL(photo)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [photo])

  function linkValue(key: LinkKey): string {
    return key === "website" ? draft.websiteUrl : (draft.socialLinks[key] ?? "")
  }

  function setLink(key: LinkKey, value: string): void {
    setDraft((current) =>
      key === "website"
        ? { ...current, websiteUrl: value }
        : { ...current, socialLinks: { ...current.socialLinks, [key]: value } },
    )
  }

  function addTag(raw: string): void {
    const next = raw.trim().slice(0, 40)
    if (!next) return
    setDraft((current) =>
      current.tags.length >= 12 || current.tags.includes(next)
        ? current
        : { ...current, tags: [...current.tags, next] },
    )
  }

  const badLinks = LINKS.filter(
    ({ key }) => shown.includes(key) && !validUrl(linkValue(key)),
  ).map(({ key }) => key)
  const canSave = Boolean(owner && lock.gauge) && badLinks.length === 0

  async function submit(): Promise<void> {
    if (!owner || !lock.gauge || !canSave || busy) return
    const ok = await save({
      gaugeAddress: lock.gauge,
      veBtcTokenId: lock.id,
      ownerAddress: owner,
      draft: {
        ...draft,
        websiteUrl: shown.includes("website") ? draft.websiteUrl : "",
        socialLinks: shownLinks(draft.socialLinks, shown),
      },
      photo,
    })
    if (!ok) return
    toast({ title: "Profile saved", description: `veBTC #${lock.id}` })
    onClose()
  }

  const name = draft.displayName.trim()
  const avatar = preview ?? draft.profilePictureUrl

  return (
    <LockSheet
      title="Manage profile"
      description={`veBTC #${lock.id}${owner ? ` · ${shortenAddress(owner)}` : ""}`}
      size="md"
      onClose={() => {
        if (!busy) onClose()
      }}
    >
      <form
        noValidate
        className="flex flex-col gap-3 pt-1"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <h3 className={section}>Identity</h3>
        <div className="flex items-start gap-3.5">
          {avatar ? (
            <img
              src={avatar}
              alt=""
              className="size-16 shrink-0 rounded-full bg-inset object-cover"
            />
          ) : (
            <span
              aria-hidden="true"
              className="flex size-16 shrink-0 items-center justify-center rounded-full bg-on-card text-metric font-700 text-accent"
            >
              {monogramInitials(name || lock.gauge || "G").slice(0, 1)}
            </span>
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <p className="m-0 flex flex-wrap items-center gap-x-1.5 text-label text-accent-ink">
              <button
                type="button"
                className="font-500 underline-offset-2 hover:underline"
                onClick={() => fileRef.current?.click()}
              >
                {photo ? "Replace photo" : "Change photo"}
              </button>
              <span aria-hidden="true">·</span>
              <span>PNG, JPG, WebP</span>
              <span aria-hidden="true">·</span>
              <span>5 MB max</span>
            </p>
            <input
              ref={fileRef}
              type="file"
              accept={Object.keys(AVATAR_TYPES).join(",")}
              aria-label="Profile photo"
              className="sr-only"
              tabIndex={-1}
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null
                event.target.value = ""
                if (!file) return
                if (!AVATAR_TYPES[file.type]) {
                  setPhotoError("Choose a PNG, JPG or WebP image")
                } else if (file.size > AVATAR_MAX_BYTES) {
                  setPhotoError("That image is over 5 MB")
                } else {
                  setPhotoError(null)
                  setPhoto(file)
                }
              }}
            />
            {photoError ? (
              <p role="alert" className="m-0 text-label font-500 text-neg">
                {photoError}
              </p>
            ) : null}
            <Field.Root>
              <Field.Label className={label}>Display name</Field.Label>
              <Field.Control>
                <Input.Root
                  size="lg"
                  maxLength={80}
                  value={draft.displayName}
                  onChange={(event) =>
                    setDraft({ ...draft, displayName: event.target.value })
                  }
                />
              </Field.Control>
            </Field.Root>
          </div>
        </div>
        <TextField
          label="Description"
          value={draft.description}
          onChange={(description) => setDraft({ ...draft, description })}
        />

        <h3 className={section}>Links</h3>
        <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
          {LINKS.map(({ key, label: text }) => {
            const on = shown.includes(key)
            return (
              <li key={key}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setShown((current) =>
                      on
                        ? current.filter((item) => item !== key)
                        : [...current, key],
                    )
                  }
                  className={cn(
                    chip,
                    on
                      ? "bg-accent-soft text-accent-ink"
                      : "bg-inset text-secondary hover:text-ink",
                  )}
                >
                  {on ? text : `+ ${text}`}
                </button>
              </li>
            )
          })}
        </ul>
        <ol className="m-0 flex list-none flex-col gap-3 p-0">
          {LINKS.filter(({ key }) => shown.includes(key)).map(
            ({ key, label: text }) => (
              <Field.Root key={key} invalid={badLinks.includes(key)}>
                <Field.Label className={label}>{text}</Field.Label>
                <Field.Control>
                  <Input.Root
                    size="lg"
                    type="url"
                    inputMode="url"
                    placeholder="https://"
                    value={linkValue(key)}
                    onChange={(event) => setLink(key, event.target.value)}
                  />
                </Field.Control>
                <Field.Error>
                  {badLinks.includes(key) ? "Enter a full https:// link" : null}
                </Field.Error>
              </Field.Root>
            ),
          )}
        </ol>

        <h3 className={section}>Tags</h3>
        <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
          {draft.tags.map((tag) => (
            <li key={tag}>
              <button
                type="button"
                aria-label={`Remove tag ${tag}`}
                onClick={() =>
                  setDraft({
                    ...draft,
                    tags: draft.tags.filter((item) => item !== tag),
                  })
                }
                className={cn(
                  chip,
                  "bg-accent-soft text-accent-ink hover:bg-accent-soft-2",
                )}
              >
                {tag}
                <span aria-hidden="true">×</span>
              </button>
            </li>
          ))}
          {draft.tags.length < 12 ? (
            <li>
              <input
                aria-label="Add a tag"
                placeholder="+ Add tag"
                value={tagDraft}
                maxLength={40}
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
                onBlur={() => {
                  addTag(tagDraft)
                  setTagDraft("")
                }}
                className={cn(
                  chip,
                  "w-28 bg-inset text-ink placeholder:text-secondary",
                )}
              />
            </li>
          ) : null}
        </ul>

        <h3 className={section}>Strategy</h3>
        <TextField
          label="Incentive strategy"
          value={draft.incentiveStrategy}
          onChange={(incentiveStrategy) =>
            setDraft({ ...draft, incentiveStrategy })
          }
        />
        <TextField
          label="Voting strategy"
          value={draft.votingStrategy}
          onChange={(votingStrategy) => setDraft({ ...draft, votingStrategy })}
        />

        <ErrorNote message={error} />
        <div className="sticky -bottom-8 flex items-center justify-end gap-2 bg-surface py-3">
          <p aria-live="polite" className="m-0 mr-auto text-label text-muted">
            {stage === "photo"
              ? "Sign to upload the photo"
              : stage === "profile"
                ? "Sign to save"
                : photo
                  ? "2 signatures"
                  : "1 signature"}
          </p>
          <Button.Root
            variant="ghost"
            size="lg"
            className="h-9 bg-inset px-3.5 font-500"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </Button.Root>
          <Button.Root
            type="submit"
            size="lg"
            className="h-9"
            loading={busy}
            disabled={!canSave}
          >
            Save profile
          </Button.Root>
        </div>
      </form>
    </LockSheet>
  )
}

function TextField({
  label: text,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}): ReactElement {
  return (
    <Field.Root>
      <Field.Label className={label}>{text}</Field.Label>
      <Field.Control>
        <Textarea.Root
          rows={3}
          maxLength={2000}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </Field.Control>
    </Field.Root>
  )
}
