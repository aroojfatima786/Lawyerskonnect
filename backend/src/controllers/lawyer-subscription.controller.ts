import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../schemas/user.schema';
import { PaymentMethod } from '../schemas/payment.schema';
import { LawyerSubscriptionService } from '../services/lawyer-subscription.service';
import { LawyerPlanLimitsService } from '../services/lawyer-plan-limits.service';
import type { SubscriptionBillingCycle } from '../config/subscription-plans';

const VALID_OBJECT_ID_LENGTH = 24;

@ApiTags('Lawyer Subscription')
@Controller('lawyers/me/subscription')
export class LawyerSubscriptionController {
  constructor(
    private readonly subscriptionService: LawyerSubscriptionService,
    private readonly planLimitsService: LawyerPlanLimitsService,
  ) {}

  @Get()
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.LAWYER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current lawyer subscription and monthly usage' })
  async getMySubscription(@Req() req) {
    const [subscription, usage] = await Promise.all([
      this.subscriptionService.getMySubscription(req.user.userId),
      this.planLimitsService.getUsageSummary(req.user.userId),
    ]);
    return {
      ...subscription,
      data: {
        ...(subscription as any).data,
        usage,
      },
    };
  }

  @Get('usage')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.LAWYER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get lawyer plan usage for current month' })
  getUsage(@Req() req) {
    return this.planLimitsService.getUsageSummary(req.user.userId).then((data) => ({
      success: true,
      data,
    }));
  }

  @Get('plans')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get subscription plan catalog' })
  getPlans(@Query('billingCycle') billingCycle?: string) {
    const cycle =
      billingCycle === 'yearly' ? ('yearly' as const) : ('monthly' as const);
    return this.subscriptionService.getPlansCatalog(cycle);
  }

  @Post('checkout')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.LAWYER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Start subscription checkout' })
  checkout(
    @Req() req,
    @Body()
    body: {
      planCode: 'professional' | 'premium';
      billingCycle: SubscriptionBillingCycle;
      method: PaymentMethod;
      accountIdentifier?: string;
      stripeCheckout?: boolean;
    },
  ) {
    if (!body?.planCode || !body?.billingCycle || !body?.method) {
      throw new BadRequestException('planCode, billingCycle, and method are required');
    }
    return this.subscriptionService.checkout(req.user.userId, body);
  }

  @Post('payments/:id/confirm')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.LAWYER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Confirm subscription payment (manual provider)' })
  confirmPayment(
    @Req() req,
    @Param('id') id: string,
    @Body()
    body: {
      transactionId?: string;
      success?: boolean;
      code?: 'declined' | 'gateway_unavailable';
      reason?: string;
    },
  ) {
    if (!id || id.length !== VALID_OBJECT_ID_LENGTH) {
      throw new BadRequestException('Invalid payment id');
    }
    const failure =
      body.success === false || body.code
        ? { code: body.code || 'declined', reason: body.reason }
        : undefined;
    return this.subscriptionService.confirmSubscriptionPayment(
      id,
      req.user.userId,
      body.transactionId,
      failure,
    );
  }

  @Post('cancel')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.LAWYER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cancel subscription at period end' })
  cancel(@Req() req) {
    return this.subscriptionService.cancelSubscription(req.user.userId);
  }

  @Get('payments')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.LAWYER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Subscription payment history' })
  getPayments(
    @Req() req,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.subscriptionService.getSubscriptionPayments(
      req.user.userId,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }
}
