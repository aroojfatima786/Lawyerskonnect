import {
  Body,
  Controller,
  Post,
  Req,
  UseGuards,
  BadRequestException,
  Headers,
  Logger,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { StripePaymentService } from '../services/stripe-payment.service';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../schemas/user.schema';
import { CreateStripeSessionDto } from '../dto/stripe-payment.dto';

function resolveStripeRawBody(req: RawBodyRequest<Request>): Buffer | null {
  if (req.rawBody && Buffer.isBuffer(req.rawBody)) {
    return req.rawBody;
  }
  if (Buffer.isBuffer(req.body)) {
    return req.body;
  }
  if (typeof req.body === 'string' && req.body.length > 0) {
    return Buffer.from(req.body, 'utf8');
  }
  return null;
}

@ApiTags('Stripe Payments')
@Controller('payment/stripe')
export class StripePaymentController {
  private readonly logger = new Logger(StripePaymentController.name);

  constructor(private readonly stripePaymentService: StripePaymentService) {}

  @Post('create-session')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.CITIZEN, UserRole.LAWYER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create Stripe Checkout session (optional feature)' })
  async createSession(@Req() req: Request & { user: { userId: string } }, @Body() body: CreateStripeSessionDto) {
    return this.stripePaymentService.createCheckoutSession(req.user.userId, body);
  }

  @Post('sync-session')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.CITIZEN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Sync Stripe checkout after return (when webhook not received yet)' })
  async syncSession(
    @Req() req: Request & { user: { userId: string } },
    @Body() body: { appointmentId?: string; paymentId?: string },
  ) {
    return this.stripePaymentService.syncConsultationPaymentAfterStripeReturn(req.user.userId, body);
  }

  @Post('webhook')
  @ApiOperation({ summary: 'Stripe webhook (checkout.session.completed)' })
  async webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature?: string,
  ) {
    const rawBody = resolveStripeRawBody(req);
    const bodyType = Buffer.isBuffer(req.body)
      ? 'Buffer'
      : req.body === null || req.body === undefined
        ? 'empty'
        : typeof req.body;

    this.logger.log(
      `Stripe webhook hit path=${req.originalUrl || req.url} signaturePresent=${Boolean(signature)} bodyType=${bodyType} rawBodyBytes=${rawBody?.length ?? 0}`,
    );

    if (!rawBody || !Buffer.isBuffer(rawBody)) {
      throw new BadRequestException({
        message: 'Stripe webhook requires raw request body',
        reason: 'body_not_buffer',
        bodyType,
        hasRawBodyField: Boolean(req.rawBody),
        hint: 'Use express.raw on /payment/stripe/webhook and do not parse JSON on this route',
      });
    }

    return this.stripePaymentService.handleWebhook(rawBody, signature);
  }
}
