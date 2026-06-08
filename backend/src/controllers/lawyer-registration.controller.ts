import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  BadRequestException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PaymentMethod } from '../schemas/payment.schema';
import { LawyerRegistrationService } from '../services/lawyer-registration.service';
import { StripePaymentService } from '../services/stripe-payment.service';

const VALID_OBJECT_ID_LENGTH = 24;

@ApiTags('Lawyer Registration')
@Controller('auth/lawyer/registration')
export class LawyerRegistrationController {
  constructor(
    private readonly registrationService: LawyerRegistrationService,
    private readonly stripePaymentService: StripePaymentService,
  ) {}

  @Get('fee')
  @ApiOperation({ summary: 'Get lawyer registration fee (public)' })
  getFee() {
    return this.registrationService.getFeeInfo();
  }

  @Get('status/:userId')
  @ApiOperation({ summary: 'Registration payment status for a lawyer signup (public)' })
  getStatus(@Param('userId') userId: string) {
    if (!userId || userId.length !== VALID_OBJECT_ID_LENGTH) {
      throw new BadRequestException('Invalid user id');
    }
    return this.registrationService.getRegistrationStatus(userId);
  }

  @Post('checkout')
  @ApiOperation({ summary: 'Start lawyer registration payment (public, after signup)' })
  checkout(
    @Body()
    body: {
      userId: string;
      method: PaymentMethod;
      accountIdentifier?: string;
      stripeCheckout?: boolean;
    },
  ) {
    if (!body?.userId || body.userId.length !== VALID_OBJECT_ID_LENGTH) {
      throw new BadRequestException('userId is required');
    }
    if (!body?.method) {
      throw new BadRequestException('method is required');
    }
    return this.registrationService.checkout(body.userId, {
      method: body.method,
      accountIdentifier: body.accountIdentifier,
      stripeCheckout: body.stripeCheckout,
    });
  }

  @Post('payments/:id/confirm')
  @ApiOperation({ summary: 'Confirm registration payment (manual provider)' })
  confirmPayment(
    @Param('id') id: string,
    @Body()
    body: {
      userId: string;
      transactionId?: string;
      success?: boolean;
      code?: 'declined' | 'gateway_unavailable';
      reason?: string;
    },
  ) {
    if (!id || id.length !== VALID_OBJECT_ID_LENGTH) {
      throw new BadRequestException('Invalid payment id');
    }
    if (!body?.userId || body.userId.length !== VALID_OBJECT_ID_LENGTH) {
      throw new BadRequestException('userId is required');
    }
    const failure =
      body.success === false || body.code
        ? { code: body.code || ('declined' as const), reason: body.reason }
        : undefined;
    return this.registrationService.confirmRegistrationPayment(
      id,
      body.userId,
      body.transactionId,
      failure,
    );
  }

  @Post('stripe-session')
  @ApiOperation({ summary: 'Create Stripe session for lawyer registration (public, testing)' })
  createStripeSession(
    @Body()
    body: {
      userId: string;
      paymentId: string;
      amount: number;
      walletMethod?: 'jazzcash' | 'easypaisa';
    },
  ) {
    if (!body?.userId || body.userId.length !== VALID_OBJECT_ID_LENGTH) {
      throw new BadRequestException('userId is required');
    }
    if (!body?.paymentId || body.paymentId.length !== VALID_OBJECT_ID_LENGTH) {
      throw new BadRequestException('paymentId is required');
    }
    return this.stripePaymentService.createRegistrationCheckoutSession({
      userId: body.userId,
      orderId: body.paymentId,
      amount: body.amount,
      currency: 'PKR',
      walletMethod: body.walletMethod,
    });
  }

  @Post('sync-stripe')
  @ApiOperation({
    summary: 'Confirm Stripe registration payment after redirect (when webhook has not run)',
  })
  async syncStripe(@Body() body: { userId: string }) {
    if (!body?.userId || body.userId.length !== VALID_OBJECT_ID_LENGTH) {
      throw new BadRequestException('userId is required');
    }
    await this.stripePaymentService.syncRegistrationPaymentAfterStripeReturn(body.userId);
    await this.registrationService.ensureRegistrationPaidFromRecords(body.userId);
    return this.registrationService.getRegistrationStatus(body.userId);
  }
}
