import nodemailer, { type Transporter } from 'nodemailer';
import type { Logger } from '../lib/logger.js';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** Strategy for outgoing mail: SMTP in deployments, a capturing logger in dev and tests. */
export interface Mailer {
  readonly kind: 'smtp' | 'log';
  send(msg: EmailMessage): Promise<void>;
}

export class SmtpMailer implements Mailer {
  readonly kind = 'smtp';
  private readonly transport: Transporter;

  constructor(
    url: string,
    private readonly from: string,
  ) {
    this.transport = nodemailer.createTransport(url);
  }

  async send(msg: EmailMessage): Promise<void> {
    // A thrown error fails the job, which BullMQ retries with backoff.
    await this.transport.sendMail({ from: this.from, ...msg });
  }
}

/** Logs instead of sending, and keeps the last messages so tests can read the links. */
export class LogMailer implements Mailer {
  readonly kind = 'log';
  readonly sent: EmailMessage[] = [];

  constructor(private readonly logger: Logger) {}

  async send(msg: EmailMessage): Promise<void> {
    this.sent.push(msg);
    if (this.sent.length > 100) this.sent.shift();
    this.logger.info({ to: msg.to, subject: msg.subject }, 'email (not sent: SMTP_URL unset)');
  }
}
