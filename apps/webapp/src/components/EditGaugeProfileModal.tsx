import type { GaugeProfile, SocialLinks } from "@/config/supabase"
import { useUpsertGaugeProfile } from "@/hooks/useGaugeProfiles"
import {
  Button,
  Input,
  Modal,
  ModalBody,
  ModalHeader,
  Textarea,
} from "@mezo-org/mezo-clay"
import { useEffect, useState } from "react"
import type { Address } from "viem"

type EditGaugeProfileModalProps = {
  isOpen: boolean
  onClose: () => void
  gaugeAddress: Address
  veBTCTokenId?: bigint | undefined
  ownerAddress: Address
  currentProfile?: GaugeProfile | null | undefined
  onProfileUpdated?: (() => void) | undefined
}

export function EditGaugeProfileModal({
  isOpen,
  onClose,
  gaugeAddress,
  veBTCTokenId,
  ownerAddress,
  currentProfile,
  onProfileUpdated,
}: EditGaugeProfileModalProps) {
  const [displayName, setDisplayName] = useState("")
  const [profilePictureUrl, setProfilePictureUrl] = useState("")
  const [websiteUrl, setWebsiteUrl] = useState("")
  const [description, setDescription] = useState("")
  const [twitterUrl, setTwitterUrl] = useState("")
  const [discordUrl, setDiscordUrl] = useState("")
  const [telegramUrl, setTelegramUrl] = useState("")
  const [githubUrl, setGithubUrl] = useState("")
  const [incentiveStrategy, setIncentiveStrategy] = useState("")
  const [votingStrategy, setVotingStrategy] = useState("")

  const { upsertProfile, isLoading, error } = useUpsertGaugeProfile()

  useEffect(() => {
    if (currentProfile) {
      setDisplayName(currentProfile.display_name ?? "")
      setProfilePictureUrl(currentProfile.profile_picture_url ?? "")
      setWebsiteUrl(currentProfile.website_url ?? "")
      setDescription(currentProfile.description ?? "")
      setTwitterUrl(currentProfile.social_links?.twitter ?? "")
      setDiscordUrl(currentProfile.social_links?.discord ?? "")
      setTelegramUrl(currentProfile.social_links?.telegram ?? "")
      setGithubUrl(currentProfile.social_links?.github ?? "")
      setIncentiveStrategy(currentProfile.incentive_strategy ?? "")
      setVotingStrategy(currentProfile.voting_strategy ?? "")
    }
  }, [currentProfile])

  const handleSave = async () => {
    const socialLinks: SocialLinks = {
      ...(twitterUrl.trim() ? { twitter: twitterUrl.trim() } : {}),
      ...(discordUrl.trim() ? { discord: discordUrl.trim() } : {}),
      ...(telegramUrl.trim() ? { telegram: telegramUrl.trim() } : {}),
      ...(githubUrl.trim() ? { github: githubUrl.trim() } : {}),
    }

    const res = await upsertProfile({
      gaugeAddress,
      veBTCTokenId: veBTCTokenId ?? 0n,
      ownerAddress,
      displayName: displayName.trim() || null,
      profilePictureUrl: profilePictureUrl.trim() || null,
      websiteUrl: websiteUrl.trim() || null,
      description: description.trim() || null,
      socialLinks,
      incentiveStrategy: incentiveStrategy.trim() || null,
      votingStrategy: votingStrategy.trim() || null,
    })

    if (res) {
      onProfileUpdated?.()
      onClose()
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      overrides={{
        Dialog: { style: { maxWidth: "560px", width: "100%" } },
      }}
    >
      <ModalHeader>Edit Validator Profile</ModalHeader>
      <ModalBody>
        <div className="flex flex-col gap-4 max-h-[70vh] overflow-y-auto pr-1">
          <div>
            <div className="mb-1 block text-2xs uppercase tracking-wider text-[var(--content-tertiary)]">
              Display Name
            </div>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Boar Finance"
            />
          </div>

          <div>
            <div className="mb-1 block text-2xs uppercase tracking-wider text-[var(--content-tertiary)]">
              Profile Logo / Avatar URL
            </div>
            <Input
              value={profilePictureUrl}
              onChange={(e) => setProfilePictureUrl(e.target.value)}
              placeholder="https://example.com/logo.png"
            />
          </div>

          <div>
            <div className="mb-1 block text-2xs uppercase tracking-wider text-[var(--content-tertiary)]">
              Website URL
            </div>
            <Input
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              placeholder="https://boar.network"
            />
          </div>

          <div>
            <div className="mb-1 block text-2xs uppercase tracking-wider text-[var(--content-tertiary)]">
              Description
            </div>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe your validator infrastructure, commission, and uptime commitment."
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <div className="mb-1 block text-2xs uppercase tracking-wider text-[var(--content-tertiary)]">
                Twitter / X
              </div>
              <Input
                value={twitterUrl}
                onChange={(e) => setTwitterUrl(e.target.value)}
                placeholder="https://x.com/boar"
              />
            </div>
            <div>
              <div className="mb-1 block text-2xs uppercase tracking-wider text-[var(--content-tertiary)]">
                Discord
              </div>
              <Input
                value={discordUrl}
                onChange={(e) => setDiscordUrl(e.target.value)}
                placeholder="https://discord.gg/..."
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <div className="mb-1 block text-2xs uppercase tracking-wider text-[var(--content-tertiary)]">
                Telegram
              </div>
              <Input
                value={telegramUrl}
                onChange={(e) => setTelegramUrl(e.target.value)}
                placeholder="https://t.me/..."
              />
            </div>
            <div>
              <div className="mb-1 block text-2xs uppercase tracking-wider text-[var(--content-tertiary)]">
                GitHub
              </div>
              <Input
                value={githubUrl}
                onChange={(e) => setGithubUrl(e.target.value)}
                placeholder="https://github.com/..."
              />
            </div>
          </div>

          {error && (
            <p className="text-xs text-[var(--negative)]">{error.message}</p>
          )}

          <div className="mt-4 flex justify-end gap-2 border-t border-[var(--border)] pt-4">
            <Button kind="secondary" onClick={onClose} disabled={isLoading}>
              Cancel
            </Button>
            <Button kind="primary" onClick={handleSave} isLoading={isLoading}>
              Save Profile
            </Button>
          </div>
        </div>
      </ModalBody>
    </Modal>
  )
}

export default EditGaugeProfileModal
