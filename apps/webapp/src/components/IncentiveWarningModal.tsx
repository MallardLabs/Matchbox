import { Button, Modal, ModalBody, ModalHeader } from "@mezo-org/mezo-clay"

type IncentiveWarningModalProps = {
  isOpen: boolean
  onClose: () => void
  onContinue: () => void
  onVoteFirst: () => void
}

export default function IncentiveWarningModal({
  isOpen,
  onClose,
  onContinue,
  onVoteFirst,
}: IncentiveWarningModalProps): JSX.Element {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      overrides={{
        Dialog: { style: { maxWidth: "480px", width: "100%" } },
      }}
    >
      <ModalHeader>Incentive Protection Warning</ModalHeader>
      <ModalBody>
        <div className="flex flex-col gap-4">
          <div className="rounded-lg border border-[var(--warning-subtle)] bg-[var(--warning-subtle)] p-4">
            <p className="text-sm font-semibold text-[var(--warning)]">
              This gauge currently has no votes
            </p>
            <p className="mt-2 text-sm text-[var(--warning)]">
              If no one votes for this gauge during the current epoch, your
              incentives will be permanently lost and cannot be reclaimed.
            </p>
          </div>

          <p className="text-sm text-[var(--content-secondary)]">
            To protect your incentives, we recommend voting on your gauge first.
            This ensures at least one vote exists and your incentives will not
            be wasted.
          </p>

          <div className="flex flex-col gap-2">
            <Button kind="primary" onClick={onVoteFirst}>
              Vote on This Gauge First
            </Button>
            <Button kind="secondary" onClick={onContinue}>
              I Understand the Risk, Continue
            </Button>
            <Button kind="tertiary" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </div>
      </ModalBody>
    </Modal>
  )
}
