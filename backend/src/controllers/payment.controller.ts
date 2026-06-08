import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
  Req,
  BadRequestException,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { PaymentService } from '../services/payment.service';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../schemas/user.schema';
import { PaymentMethod } from '../schemas/payment.schema';

const VALID_OBJECT_ID_LENGTH = 24;

@ApiTags('Payments')
@Controller('payments')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post('initiate')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.CITIZEN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Initiate payment for an appointment' })
  async initiatePayment(
    @Req() req,
    @Body() body: {
      appointmentId: string;
      method: PaymentMethod;
      accountIdentifier?: string;
    },
  ) {
    const aid = body?.appointmentId?.trim?.();
    if (!aid || aid.length !== VALID_OBJECT_ID_LENGTH) {
      throw new BadRequestException(
        'Invalid appointment id. Use the Pay Now button from My Appointments.',
      );
    }
    return this.paymentService.initiatePayment(
      req.user.userId,
      aid,
      body.method,
      body.accountIdentifier,
    );
  }

  @Get('citizen-checkout-context')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.CITIZEN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Checkout labeling context (demo vs gateway; no secrets)',
  })
  getCitizenCheckoutContext() {
    return this.paymentService.getCitizenCheckoutContext();
  }

  @Post('webhooks/jazzcash')
  @ApiOperation({ summary: 'JazzCash webhook callback' })
  async jazzcashWebhook(@Body() body: Record<string, any>, @Req() req) {
    return this.paymentService.handleJazzcashWebhook(body, req.headers || {});
  }

  @Get('return/jazzcash')
  @ApiOperation({ summary: 'JazzCash return callback' })
  async jazzcashReturn(@Query() query: Record<string, any>, @Res() res: Response) {
    const url = await this.paymentService.jazzCashReturnRedirectUrlAsync(query);
    return res.redirect(302, url);
  }

  @Post('webhooks/easypaisa')
  @ApiOperation({ summary: 'EasyPaisa webhook callback' })
  async easypaisaWebhook(@Body() body: Record<string, any>, @Req() req) {
    return this.paymentService.handleEasypaisaWebhook(body, req.headers || {});
  }

  @Get('return/easypaisa')
  @ApiOperation({ summary: 'EasyPaisa return callback' })
  async easypaisaReturn(@Query() query: Record<string, any>, @Res() res: Response) {
    const url = await this.paymentService.easyPaisaReturnRedirectUrlAsync(query);
    return res.redirect(302, url);
  }

  @Get('admin/all')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all payments (admin only)' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'method', required: false })
  @ApiQuery({ name: 'paymentType', required: false })
  @ApiQuery({ name: 'type', required: false })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getAllPayments(@Query() filters: any) {
    return this.paymentService.getAllPayments(
      filters,
      filters.page ? parseInt(filters.page) : 1,
      filters.limit ? parseInt(filters.limit) : 20,
    );
  }

  @Get('admin/wallet')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get platform (admin) wallet balance' })
  async getPlatformWallet() {
    return this.paymentService.getPlatformWalletBalance();
  }

  @Get('admin/payouts')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get payouts (admin only)' })
  async getAdminPayouts(@Query() filters: any) {
    return this.paymentService.getAdminPayouts(
      filters,
      filters.page ? parseInt(filters.page) : 1,
      filters.limit ? parseInt(filters.limit) : 20,
    );
  }

  @Post('admin/payouts/:payoutId/release')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mark payout as released (admin only, manual transfer)' })
  async releasePayout(
    @Req() req,
    @Param('payoutId') payoutId: string,
    @Body() body: { externalTransferReference?: string; notes?: string },
  ) {
    return this.paymentService.releasePayoutByAdmin(payoutId, req.user.userId, body);
  }

  @Post('admin/payouts/:payoutId/mark-failed')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mark payout as failed (admin only)' })
  async markPayoutFailed(
    @Req() req,
    @Param('payoutId') payoutId: string,
    @Body() body: { failureReason?: string },
  ) {
    return this.paymentService.markPayoutFailedByAdmin(
      payoutId,
      req.user.userId,
      body.failureReason || 'Marked failed by admin',
    );
  }

  @Get()
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get payment history (consultation only for citizens/lawyer earnings)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getPayments(
    @Req() req,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.paymentService.getUserPayments(
      req.user.userId,
      req.user.role,
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 10,
    );
  }

  @Get(':id')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get payment details' })
  async getPayment(@Param('id') id: string, @Req() req) {
    return this.paymentService.getPaymentById(id, req.user.userId, req.user.role);
  }

  @Get(':id/invoice/pdf')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Download payment invoice (PDF)' })
  async downloadInvoicePdf(@Param('id') id: string, @Req() req, @Res() res: Response) {
    const invoice = await this.paymentService.getPaymentInvoicePdf(id, req.user.userId, req.user.role);
    res.setHeader('Content-Type', invoice.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${invoice.filename}"`);
    return res.send(invoice.buffer);
  }

  @Get(':id/invoice')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Download payment invoice (HTML)' })
  async downloadInvoice(@Param('id') id: string, @Req() req, @Res() res: Response) {
    const invoice = await this.paymentService.getPaymentInvoiceHtml(id, req.user.userId, req.user.role);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${invoice.filename}"`);
    return res.send(invoice.html);
  }

  @Post(':id/confirm')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.CITIZEN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Confirm consultation payment (manual provider)' })
  async confirmPayment(
    @Req() req,
    @Param('id') id: string,
    @Body() body: {
      transactionId?: string;
      success?: boolean;
      code?: 'declined' | 'gateway_unavailable';
      reason?: string;
    },
  ) {
    const failure =
      body.success === false || body.code
        ? { code: body.code || 'declined', reason: body.reason }
        : undefined;
    return this.paymentService.confirmPayment(id, req.user.userId, body.transactionId, failure);
  }

  @Post(':id/refund')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Process refund (admin only, consultation payments)' })
  async processRefund(
    @Param('id') id: string,
    @Req() req,
    @Body() body: { reason: string },
  ) {
    return this.paymentService.processRefund(id, req.user.userId, body.reason);
  }
}
