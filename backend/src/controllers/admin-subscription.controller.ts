import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../schemas/user.schema';
import { LawyerSubscriptionService } from '../services/lawyer-subscription.service';
import type { SubscriptionBillingCycle, SubscriptionPlanCode } from '../config/subscription-plans';

@ApiTags('Admin Subscriptions')
@Controller('admin/subscriptions')
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiBearerAuth()
export class AdminSubscriptionController {
  constructor(private readonly subscriptionService: LawyerSubscriptionService) {}

  @Get()
  @ApiOperation({ summary: 'List lawyer subscriptions' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'planCode', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  list(@Query() filters: Record<string, string>) {
    return this.subscriptionService.listAdminSubscriptions({
      status: filters.status,
      planCode: filters.planCode,
      page: filters.page ? parseInt(filters.page, 10) : 1,
      limit: filters.limit ? parseInt(filters.limit, 10) : 20,
    });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Admin override subscription status' })
  override(
    @Param('id') id: string,
    @Body()
    body: {
      action: 'activate' | 'expire' | 'cancel' | 'mark_failed';
      planCode?: SubscriptionPlanCode;
      billingCycle?: SubscriptionBillingCycle;
      days?: number;
    },
  ) {
    return this.subscriptionService.adminOverrideSubscription(id, body.action, body);
  }
}
