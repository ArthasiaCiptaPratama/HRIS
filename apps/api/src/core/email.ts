import nodemailer from "nodemailer";
import type { Logger } from "./logger.ts";

// PLAN §5.6 & D-025/D-032: email hanya pemberitahuan + link; TIDAK PERNAH berisi data sensitif.
export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface EmailSender {
  readonly kind: "smtp" | "log";
  send(message: EmailMessage): Promise<void>;
}

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
}

export function createSmtpSender(config: SmtpConfig): EmailSender {
  // Port 587 = STARTTLS (Gmail/Workspace, D-025); 465 = TLS langsung.
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    requireTLS: config.port !== 465,
    auth: { user: config.user, pass: config.pass },
  });
  return {
    kind: "smtp",
    async send(message) {
      await transport.sendMail({
        from: config.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
      });
    },
  };
}

// Lokal (D-025): email aplikasi tidak dikirim, hanya dicatat (penerima & subjek saja).
export function createLogSender(logger: Logger): EmailSender {
  return {
    kind: "log",
    async send(message) {
      logger.info("email (not sent: SMTP not configured)", {
        to: message.to,
        subject: message.subject,
      });
    },
  };
}
