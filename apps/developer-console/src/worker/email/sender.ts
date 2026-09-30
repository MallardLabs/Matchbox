import type { Logger } from "@repo/logger"
import type { EmailContent } from "./templates"

export type OutgoingEmail = EmailContent & { to: string }

/** Routes depend on this; the binding, logger and memory senders implement it. */
export type EmailSender = {
  send(email: OutgoingEmail): Promise<void>
}

export const emailFrom = {
  email: "no-reply@matchbox.markets",
  name: "Matchbox",
} as const

/** Cloudflare Email Service `send_email` binding. */
export function createBindingEmailSender(binding: SendEmail): EmailSender {
  return {
    async send(email) {
      await binding.send({
        to: email.to,
        from: emailFrom,
        subject: email.subject,
        text: email.text,
        html: email.html,
      })
    },
  }
}

/**
 * Local development without the binding: logs the text body (which carries
 * the code or link) so sign-up works offline. Never used in production.
 */
export function createLogEmailSender(logger: Logger): EmailSender {
  return {
    async send(email) {
      logger.info({
        message: "Email (dev, not sent)",
        to: email.to,
        subject: email.subject,
        body: email.text,
      })
    },
  }
}

export type MemoryEmailSender = EmailSender & { sent: OutgoingEmail[] }

export function createMemoryEmailSender(): MemoryEmailSender {
  const sent: OutgoingEmail[] = []
  return {
    sent,
    async send(email) {
      sent.push(email)
    },
  }
}
