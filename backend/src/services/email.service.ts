import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import * as nodemailer from 'nodemailer';

type EmailProvider = 'ses' | 'mock' | 'gmail';

@Injectable()
export class EmailService implements OnModuleInit {
  private sesClient: SESClient | null = null;
  private nodemailerTransporter: nodemailer.Transporter | null = null;
  private senderEmail = '';
  private frontendUrl = '';
  private emailProvider: EmailProvider = 'mock';
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    const provider = (this.configService.get<string>('EMAIL_PROVIDER') || 'mock').toLowerCase();

    if (provider !== 'ses' && provider !== 'mock' && provider !== 'gmail') {
      throw new Error(
        `Invalid EMAIL_PROVIDER "${provider}". Use: mock (dev — emails log to server console only), gmail, or ses. See backend .env.example.`,
      );
    }

    this.emailProvider = provider as EmailProvider;
    this.senderEmail =
      this.configService.get<string>('SES_FROM_EMAIL') || 'noreply@lawyerskonnect.com';
    this.frontendUrl = this.getFrontendUrl();

    if (this.emailProvider === 'ses') {
      const region = this.configService.get<string>('AWS_REGION');
      const accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY_ID');
      const secretAccessKey = this.configService.get<string>('AWS_SECRET_ACCESS_KEY');

      if (!region || !accessKeyId || !secretAccessKey || !this.senderEmail) {
        throw new Error(
          'AWS SES enabled but configuration is incomplete. Required: AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, SES_FROM_EMAIL. Or use EMAIL_PROVIDER=mock for local demos.',
        );
      }

      this.sesClient = new SESClient({
        region,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
      });
      this.logger.log('Email service initialized with AWS SES provider');
    } else if (this.emailProvider === 'gmail') {
      const gmailUser = this.configService.get<string>('GMAIL_USER');
      const gmailPass = this.configService.get<string>('GMAIL_PASS');

      if (!gmailUser || !gmailPass) {
        throw new Error(
          'Gmail SMTP enabled but GMAIL_USER/GMAIL_PASS missing (use a Google App Password). Or EMAIL_PROVIDER=mock for demos (logs to console only).',
        );
      }

      this.senderEmail = gmailUser;

      this.nodemailerTransporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: gmailUser,
          pass: gmailPass,
        },
      });

      this.logger.log('Email service initialized with Gmail SMTP provider');
    } else {
      this.logger.log('Email service initialized with mock provider (console logging)');
    }
  }

  private getFrontendUrl(): string {
    const configured = (this.configService.get<string>('FRONTEND_URL') || '').trim().replace(/\/$/, '');
    if (configured) {
      return configured;
    }
    const isProd = this.configService.get<string>('NODE_ENV') === 'production';
    if (isProd) {
      throw new Error('FRONTEND_URL is required in production for email deep links');
    }
    return 'http://localhost:5173';
  }

  private buildFrontendLink(path: string, query?: Record<string, string | number | undefined>): string {
    if (/^https?:\/\//i.test(path)) {
      return path;
    }
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const url = new URL(`${this.frontendUrl}${normalizedPath}`);
    if (query) {
      Object.entries(query).forEach(([key, value]) => {
        if (value === undefined || value === null || value === '') return;
        url.searchParams.set(key, String(value));
      });
    }
    return url.toString();
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  private async sendEmail(
    to: string,
    subject: string,
    textBody: string,
    htmlBody: string,
  ): Promise<void> {
    if (this.emailProvider === 'mock') {
      console.log('='.repeat(80));
      console.log('📧 MOCK EMAIL SERVICE');
      console.log(`To: ${to}`);
      console.log(`Subject: ${subject}`);
      console.log('Text Body:');
      console.log(textBody);
      console.log('HTML Body:');
      console.log(htmlBody);
      console.log('='.repeat(80));
      return;
    }

    if (this.emailProvider === 'gmail') {
      try {
        if (!this.nodemailerTransporter) {
          throw new Error('Gmail transporter not initialized');
        }

        await this.nodemailerTransporter.sendMail({
          from: this.senderEmail,
          to,
          subject,
          text: textBody,
          html: htmlBody,
        });

        this.logger.log(`Email sent successfully to ${to}`);
      } catch (error: any) {
        const rawMessage = String(error?.message || error?.response || '');
        const isAuthError =
          rawMessage.includes('535-5.7.8') ||
          rawMessage.includes('Username and Password not accepted') ||
          rawMessage.toLowerCase().includes('invalid login');

        if (isAuthError) {
          this.logger.error(
            `Gmail SMTP authentication failed for ${to}. Check GMAIL_USER and Google App Password.`,
          );
          throw new Error(
            'Gmail SMTP authentication failed. Use a valid Google App Password.',
          );
        }

        this.logger.error(`Error sending email via Gmail SMTP to ${to}: ${rawMessage}`);
        throw new Error('Failed to send email. Please try again later.');
      }
      return;
    }

    // SES provider
    if (!this.sesClient) {
      throw new Error('Email service not properly initialized');
    }

    const params = {
      Source: this.senderEmail,
      Destination: {
        ToAddresses: [to],
      },
      Message: {
        Subject: {
          Data: subject,
          Charset: 'UTF-8',
        },
        Body: {
          Text: {
            Data: textBody,
            Charset: 'UTF-8',
          },
          Html: {
            Data: htmlBody,
            Charset: 'UTF-8',
          },
        },
      },
    };

    try {
      await this.sesClient.send(new SendEmailCommand(params));
      this.logger.log(`Email sent successfully to ${to}`);
    } catch (error) {
      this.logger.error(`Error sending email via SES to ${to}:`, error);
      throw new Error('Failed to send email. Please try again later.');
    }
  }

  async sendVerificationEmail(
    to: string,
    verificationCode: string,
    userId: string,
  ): Promise<void> {
    const subject = 'Verify Your Email - LawyersKonnect';
    const verifyUrl = this.buildFrontendLink('/auth/verify-email', {
      email: to,
      code: verificationCode,
      userId,
    });
    const textBody = `Welcome to LawyersKonnect!

Your 6-digit verification code is:

${verificationCode}

Enter this code on the verification page to complete your registration.

Verify Email: ${verifyUrl}

This code will expire in 5 minutes.

If you didn't create an account with LawyersKonnect, please ignore this email.`;

    const htmlBody = `
      <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #163b63; text-align: center;">Welcome to LawyersKonnect!</h2>
            <p>Your 6-digit verification code is:</p>

            <div style="text-align: center; margin: 30px 0;">
              <div style="
                background-color: #f8f9fa;
                border: 2px solid #163b63;
                padding: 20px;
                border-radius: 10px;
                display: inline-block;
                font-size: 32px;
                font-weight: bold;
                letter-spacing: 8px;
                color: #163b63;
                font-family: 'Courier New', monospace;">
                ${verificationCode}
              </div>
            </div>

            <p style="text-align: center; color: #333;">Enter this code on the verification page to complete your registration.</p>
            <p style="text-align: center; margin-top: 18px;">
              <a href="${verifyUrl}" style="background: #163b63; color: white; padding: 10px 16px; text-decoration: none; border-radius: 6px; display: inline-block;">Verify Email</a>
            </p>
            <p style="font-size: 12px; color: #666; text-align: center;">If the button does not work, open this link:<br>${verifyUrl}</p>

            <p style="color: #666; font-size: 14px; text-align: center; margin-top: 30px;">
              This code will expire in 5 minutes.<br>
              If you didn't create an account with LawyersKonnect, please ignore this email.
            </p>
          </div>
        </body>
      </html>
    `;

    await this.sendEmail(to, subject, textBody, htmlBody);
  }

  async sendLoginOtpEmail(to: string, loginCode: string): Promise<void> {
    const subject = 'Your Login OTP - LawyersKonnect';

    const textBody = `Your login OTP for LawyersKonnect is: ${loginCode}

This code will expire in 5 minutes.

If you did not try to login, please ignore this email.`;

    const htmlBody = `
      <html>
        <body style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="text-align: center; color: #163b63;">Login to LawyersKonnect</h2>
            <p>Use the following 6-digit OTP to complete your login:</p>

            <div style="text-align: center; margin: 30px 0;">
              <div style="
                background-color: #f8f9fa;
                border: 2px solid #163b63;
                padding: 20px;
                border-radius: 10px;
                display: inline-block;
                font-size: 32px;
                font-weight: bold;
                letter-spacing: 8px;
                color: #163b63;">
                ${loginCode}
              </div>
            </div>

            <p style="color: #666; font-size: 14px; text-align: center;">
              This code will expire in 5 minutes.<br>
              If you did not try to login, please ignore this email.
            </p>
          </div>
        </body>
      </html>
    `;

    await this.sendEmail(to, subject, textBody, htmlBody);
  }

  async sendPasswordResetEmail(to: string, resetCode: string): Promise<void> {
    const subject = 'Password Reset - LawyersKonnect';
    const resetUrl = this.buildFrontendLink('/auth/forgot-password', {
      email: to,
      code: resetCode,
    });

    const textBody = `You requested a password reset for your LawyersKonnect account.

Your 6-digit verification code is: ${resetCode}

Reset Password: ${resetUrl}

This code will expire in 5 minutes.

If you didn't request this, please ignore this email.`;

    const htmlBody = `
      <html>
        <body style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="text-align: center; color: #163b63;">Reset Your Password</h2>
            <p>You requested a password reset for your LawyersKonnect account.</p>
            <p>Use the following 6-digit code to reset your password:</p>

            <div style="text-align: center; margin: 30px 0;">
              <div style="
                background-color: #f8f9fa;
                border: 2px solid #163b63;
                padding: 20px;
                border-radius: 10px;
                display: inline-block;
                font-size: 32px;
                font-weight: bold;
                letter-spacing: 8px;
                color: #163b63;">
                ${resetCode}
              </div>
            </div>

            <p style="color: #666; font-size: 14px; text-align: center;">
              This code will expire in 5 minutes.<br>
              If you didn't request this, please ignore this email.
            </p>
            <p style="text-align: center; margin-top: 18px;">
              <a href="${resetUrl}" style="background: #163b63; color: white; padding: 10px 16px; text-decoration: none; border-radius: 6px; display: inline-block;">Reset Password</a>
            </p>
            <p style="font-size: 12px; color: #666; text-align: center;">If the button does not work, open this link:<br>${resetUrl}</p>
          </div>
        </body>
      </html>
    `;

    await this.sendEmail(to, subject, textBody, htmlBody);
  }

  async sendNotificationEmail(
    to: string,
    title: string,
    message: string,
    actionUrl?: string,
  ): Promise<void> {
    const subject = `LawyersKonnect: ${title}`;
    const deepLink = actionUrl ? this.buildFrontendLink(actionUrl) : this.buildFrontendLink('/notifications');
    const safeTitle = this.escapeHtml(title);
    const safeMessage = this.escapeHtml(message);
    const textBody = `You have a new notification from LawyersKonnect:

${title}

${message}

Open now: ${deepLink}

Please log in to your account to view more details.`;

    const htmlBody = `
      <html>
        <body style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="text-align: center; color: #163b63;">LawyersKonnect Notification</h2>
            <div style="background-color: #f8f9fa; padding: 20px; border-radius: 10px; margin: 20px 0;">
              <h3 style="margin-top: 0; color: #163b63;">${safeTitle}</h3>
              <p style="margin-bottom: 0;">${safeMessage}</p>
            </div>
            <p style="text-align: center; margin: 18px 0;">
              <a href="${deepLink}" style="background: #163b63; color: white; padding: 10px 16px; text-decoration: none; border-radius: 6px; display: inline-block;">Open Notification</a>
            </p>
            <p style="font-size: 12px; color: #666; text-align: center;">If the button does not work, open this link:<br>${deepLink}</p>
            <p style="text-align: center; color: #666;">
              Please log in to your account to view more details.
            </p>
          </div>
        </body>
      </html>
    `;

    await this.sendEmail(to, subject, textBody, htmlBody);
  }

  /**
   * Test email functionality - sends a test email to verify SMTP/SES configuration
   * @param to Recipient email address
   */
  async sendTestEmail(to: string): Promise<void> {
    const subject = 'LawyersKonnect - Email Configuration Test';
    const textBody = `Hello,

This is a test email from LawyersKonnect to verify your email configuration.

Current Provider: ${this.emailProvider.toUpperCase()}

If you received this email, your email service is working correctly!

Best regards,
LawyersKonnect Team`;

    const htmlBody = `
      <html>
        <body style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="text-align: center; color: #163b63;">Email Configuration Test</h2>
            <p>Hello,</p>
            <p>This is a test email from LawyersKonnect to verify your email configuration.</p>
            <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <p style="margin: 0;"><strong>Current Provider:</strong> ${this.emailProvider.toUpperCase()}</p>
            </div>
            <p style="color: #28a745;">✓ If you received this email, your email service is working correctly!</p>
            <p style="color: #666; font-size: 14px; margin-top: 30px;">
              Best regards,<br>
              LawyersKonnect Team
            </p>
          </div>
        </body>
      </html>
    `;

    await this.sendEmail(to, subject, textBody, htmlBody);
  }
}