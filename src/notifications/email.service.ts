import { Injectable, Inject, Logger } from '@nestjs/common';

/**
 * Pluggable email provider interface.
 * Swap implementations in NotificationModule to switch from
 * the DummyEmailProvider to a real one (e.g. Resend, SendGrid).
 */
export interface EmailProvider {
  send(to: string, subject: string, body: string): Promise<void>;
}

export const EMAIL_PROVIDER = 'EMAIL_PROVIDER';

/**
 * Dummy email provider — logs to console instead of sending real emails.
 * Used in development and testing.
 */
@Injectable()
export class DummyEmailProvider implements EmailProvider {
  private readonly logger = new Logger(DummyEmailProvider.name);

  async send(to: string, subject: string, body: string): Promise<void> {
    this.logger.log(
      `📧 [DUMMY EMAIL] To: ${to}\n  Subject: ${subject}\n  Body: ${body}`,
    );
  }
}

/**
 * EmailService wraps the active EmailProvider.
 * Inject this service wherever email delivery is needed.
 */
@Injectable()
export class EmailService {
  constructor(
    @Inject(EMAIL_PROVIDER) private readonly provider: EmailProvider,
  ) {}

  async send(to: string, subject: string, body: string): Promise<void> {
    return this.provider.send(to, subject, body);
  }
}
