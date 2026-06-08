import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import twilio from 'twilio';

export type SmsProvider = 'none' | 'mock' | 'twilio';

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly provider: SmsProvider;
  private readonly fromNumber: string;
  private readonly twilioAccountSid?: string;
  private readonly twilioAuthToken?: string;
  private twilioClient?: twilio.Twilio;

  constructor(private configService: ConfigService) {
    this.provider = (this.configService.get<string>('SMS_PROVIDER') || 'none') as SmsProvider;
    this.fromNumber = this.configService.get<string>('SMS_FROM_NUMBER') || '';
    this.twilioAccountSid = this.configService.get<string>('SMS_TWILIO_ACCOUNT_SID');
    this.twilioAuthToken = this.configService.get<string>('SMS_TWILIO_AUTH_TOKEN');

    // Initialize Twilio client if credentials are provided
    if (this.provider === 'twilio') {
      if (this.twilioAccountSid && this.twilioAuthToken) {
        try {
          this.twilioClient = twilio(this.twilioAccountSid, this.twilioAuthToken);
          this.logger.log('✅ Twilio SMS provider initialized successfully');
        } catch (error) {
          this.logger.error('❌ Failed to initialize Twilio client:', error);
        }
      } else {
        this.logger.warn(
          '⚠️  Twilio SMS provider configured but credentials missing. SMS will be skipped. ' +
          'Set SMS_TWILIO_ACCOUNT_SID and SMS_TWILIO_AUTH_TOKEN in environment variables.',
        );
      }
    } else if (this.provider === 'none') {
      this.logger.log(
        'SMS_PROVIDER=none: outbound SMS disabled. Use SMS_PROVIDER=mock to log SMS in console (demo) or twilio + credentials.',
      );
    } else if (this.provider === 'mock') {
      this.logger.log('SMS_PROVIDER=mock: SMS content is logged to the server console only (demo mode).');
    }
  }

  async sendSms(to: string, message: string): Promise<void> {
    if (!to) {
      this.logger.warn('⚠️  SMS not sent: phone number is missing');
      return;
    }

    if (this.provider === 'none') {
      this.logger.debug(`SMS provider not configured (SMS_PROVIDER=none). Skipping SMS to ${to}`);
      return;
    }

    if (this.provider === 'mock') {
      this.logger.log('📱 MOCK SMS (development):');
      this.logger.log(`  To: ${to}`);
      this.logger.log(`  From: ${this.fromNumber || 'mock-sender'}`);
      this.logger.log(`  Message: ${message.substring(0, 50)}${message.length > 50 ? '...' : ''}`);
      return;
    }

    if (this.provider === 'twilio') {
      if (!this.twilioClient || !this.fromNumber) {
        this.logger.warn(
          '⚠️  Twilio SMS skipped: client not initialized or SMS_FROM_NUMBER not configured.',
        );
        return;
      }

      try {
        const result = await this.twilioClient.messages.create({
          body: message,
          from: this.fromNumber,
          to: to,
        });

        this.logger.log(`✅ SMS sent successfully (SID: ${result.sid}) to ${to}`);
      } catch (error) {
        this.logger.error(`❌ Failed to send SMS to ${to}:`, error instanceof Error ? error.message : error);
        // Don't throw - allow app to continue even if SMS fails
      }
    } else {
      this.logger.warn(`⚠️  Unknown SMS provider: "${this.provider}". SMS skipped.`);
    }
  }
}
