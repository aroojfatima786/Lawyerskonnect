import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { LawyerSubscriptionService } from './lawyer-subscription.service';

@Injectable()
export class SubscriptionExpiryService {
  private readonly logger = new Logger(SubscriptionExpiryService.name);

  constructor(private readonly subscriptionService: LawyerSubscriptionService) {}

  /** Daily at 02:00 — expire subscriptions past currentPeriodEnd. */
  @Cron('0 2 * * *')
  async handleSubscriptionExpiry() {
    try {
      const count = await this.subscriptionService.expireDueSubscriptions();
      if (count > 0) {
        this.logger.log(`Expired ${count} lawyer subscription(s)`);
      }
    } catch (err) {
      this.logger.error('Subscription expiry job failed', err);
    }
  }
}
