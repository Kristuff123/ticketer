import nodemailer, { Transporter } from 'nodemailer';
import { Notification } from '../models/notification.js';

const DEFAULT_FROM = '"IT Ticketer" <noreply@ticketer.local>';

/**
 * Helper: delay for a given number of milliseconds.
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * EmailService handles email delivery with retry logic.
 * Requirements: 7.7
 */
export class EmailService {
  private transporter: Transporter;
  private fromAddress: string;

  /**
   * @param transportConfig - Nodemailer transport configuration.
   *   If not provided, creates a JSON transport (useful for testing).
   */
  constructor(transportConfig?: nodemailer.TransportOptions | Transporter) {
    this.fromAddress = process.env.EMAIL_FROM || DEFAULT_FROM;

    if (transportConfig && 'sendMail' in transportConfig) {
      // Already a transporter instance (e.g., a mock)
      this.transporter = transportConfig as Transporter;
    } else if (transportConfig) {
      this.transporter = nodemailer.createTransport(transportConfig);
    } else {
      // Default: JSON transport for testing (outputs to stdout, no real sending)
      this.transporter = nodemailer.createTransport({ jsonTransport: true });
    }
  }

  /**
   * Send a single email. Returns true on success, false on failure.
   */
  async sendEmail(to: string, subject: string, body: string): Promise<boolean> {
    try {
      await this.transporter.sendMail({
        from: this.fromAddress,
        to,
        subject,
        html: body,
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Send an email with retry logic.
   * Retries up to `maxRetries` times (default 3) with exponential backoff.
   * Backoff: 1000 * 2^attempt ms (1s, 2s, 4s).
   * Returns true if email was sent successfully, false after all retries exhausted.
   */
  async sendWithRetry(
    to: string,
    subject: string,
    body: string,
    maxRetries: number = 3
  ): Promise<boolean> {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const success = await this.sendEmail(to, subject, body);
      if (success) {
        return true;
      }

      // If this was the last attempt, don't wait
      if (attempt < maxRetries) {
        const backoffMs = 1000 * Math.pow(2, attempt);
        await delay(backoffMs);
      }
    }

    // All retries exhausted
    return false;
  }

  /**
   * Format and deliver a notification as an email.
   * Returns true on success, false on failure (caller should mark notification
   * with delivery failure status). Dashboard notification is preserved regardless.
   */
  async deliverNotificationEmail(
    notification: Notification,
    userEmail: string
  ): Promise<boolean> {
    const subject = `[Ticketer] ${notification.title}`;
    const body = `
      <div style="font-family: sans-serif; max-width: 600px;">
        <h2>${notification.title}</h2>
        <p>${notification.message}</p>
        ${notification.ticketId ? `<p><strong>Ticket:</strong> ${notification.ticketId}</p>` : ''}
        <hr />
        <p style="color: #666; font-size: 12px;">
          This is an automated notification from IT Ticketer.
        </p>
      </div>
    `;

    return this.sendWithRetry(userEmail, subject, body);
  }
}

export function createEmailServiceFromEnv(): EmailService {
  const transport = process.env.EMAIL_TRANSPORT?.toLowerCase();
  const smtpUser = process.env.BREVO_SMTP_LOGIN || process.env.SMTP_USER;
  const smtpPass = process.env.BREVO_SMTP_KEY || process.env.SMTP_PASS;

  if (transport === 'brevo' || smtpUser || smtpPass) {
    if (!smtpUser || !smtpPass) {
      console.warn('Email transport requested, but SMTP credentials are incomplete. Falling back to JSON transport.');
      return new EmailService();
    }

    const port = Number(process.env.BREVO_SMTP_PORT || process.env.SMTP_PORT || 587);
    return new EmailService({
      host: process.env.BREVO_SMTP_HOST || process.env.SMTP_HOST || 'smtp-relay.brevo.com',
      port,
      secure: port === 465,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    } as nodemailer.TransportOptions);
  }

  return new EmailService();
}

// Export a default instance. Uses Brevo/SMTP when configured, JSON transport otherwise.
export const emailService = createEmailServiceFromEnv();
