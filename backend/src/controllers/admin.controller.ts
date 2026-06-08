import { Controller, Get, Post, Patch, Delete, Param, Query, Body, UseGuards, Res, Req } from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AdminService } from '../services/admin.service';
import { ComplaintService } from '../services/complaint.service';
import { EmailService } from '../services/email.service';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../schemas/user.schema';
import { ComplaintStatus } from '../schemas/complaint.schema';
import { ChatViolationType } from '../schemas/chat-violation.schema';

@ApiTags('Admin')
@Controller('admin')
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiBearerAuth()
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly complaintService: ComplaintService,
    private readonly emailService: EmailService,
  ) {}

  // ==================== Dashboard ====================

  @Get('dashboard')
  @ApiOperation({ summary: 'Get dashboard statistics' })
  async getDashboardStats() {
    return this.adminService.getDashboardStats();
  }

  @Get('analytics')
  @ApiOperation({ summary: 'Get analytics chart data' })
  @ApiQuery({ name: 'period', required: false, enum: ['week', 'month', 'year'] })
  async getAnalytics(@Query('period') period?: 'week' | 'month' | 'year') {
    return this.adminService.getAnalyticsChartData(period || 'month');
  }

  @Get('integrations/overview')
  @ApiOperation({ summary: 'Email/SMS/payment demo status (no secrets)' })
  async getIntegrationsOverview() {
    return this.adminService.getIntegrationsOverview();
  }

  // ==================== User Management ====================

  @Get('users')
  @ApiOperation({ summary: 'Get all users with filters' })
  @ApiQuery({ name: 'role', required: false, enum: ['citizen', 'lawyer', 'admin'] })
  @ApiQuery({ name: 'isActive', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getAllUsers(@Query() filters: any) {
    return this.adminService.getAllUsers(
      filters,
      filters.page ? parseInt(filters.page) : 1,
      filters.limit ? parseInt(filters.limit) : 20,
    );
  }

  @Get('users/:id')
  @ApiOperation({ summary: 'Get user by ID' })
  async getUserById(@Param('id') id: string) {
    return this.adminService.getUserById(id);
  }

  @Patch('users/:id/status')
  @ApiOperation({ summary: 'Activate/deactivate user' })
  async updateUserStatus(
    @Param('id') id: string,
    @Body() body: { isActive: boolean },
  ) {
    return this.adminService.updateUserStatus(id, body.isActive);
  }

  @Delete('users/:id')
  @ApiOperation({ summary: 'Delete user' })
  async deleteUser(@Param('id') id: string) {
    return this.adminService.deleteUser(id);
  }

  // ==================== Lawyer Verification (legacy — prefer /identity/admin/*) ====================

  @Get('lawyers/pending')
  @ApiOperation({ summary: 'Get lawyers pending verification' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getPendingVerifications(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adminService.getPendingVerifications(
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 20,
    );
  }

  @Patch('lawyers/:id/verify')
  @ApiOperation({ summary: 'Approve or reject lawyer verification' })
  async verifyLawyer(
    @Param('id') id: string,
    @Body() body: { approved: boolean; rejectionReason?: string },
  ) {
    return this.adminService.verifyLawyer(id, body.approved, body.rejectionReason);
  }

  // ==================== Category Management ====================

  @Get('categories')
  @ApiOperation({ summary: 'Get all categories' })
  async getCategories() {
    return this.adminService.getCategories();
  }

  @Post('categories')
  @ApiOperation({ summary: 'Create a new category' })
  async createCategory(
    @Body() body: { name: string; description?: string; icon?: string },
  ) {
    return this.adminService.createCategory(body.name, body.description, body.icon);
  }

  @Patch('categories/:id')
  @ApiOperation({ summary: 'Update a category' })
  async updateCategory(@Param('id') id: string, @Body() body: any) {
    return this.adminService.updateCategory(id, body);
  }

  @Delete('categories/:id')
  @ApiOperation({ summary: 'Delete a category' })
  async deleteCategory(@Param('id') id: string) {
    return this.adminService.deleteCategory(id);
  }

  @Post('categories/seed')
  @ApiOperation({ summary: 'Seed default categories' })
  async seedCategories() {
    return this.adminService.seedCategories();
  }

  // ==================== Review Management ====================

  @Get('reviews')
  @ApiOperation({ summary: 'Get all reviews' })
  @ApiQuery({ name: 'lawyerId', required: false })
  @ApiQuery({ name: 'rating', required: false, type: Number })
  @ApiQuery({ name: 'isVisible', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getAllReviews(@Query() filters: any) {
    return this.adminService.getAllReviews(
      filters,
      filters.page ? parseInt(filters.page) : 1,
      filters.limit ? parseInt(filters.limit) : 20,
    );
  }

  @Delete('reviews/:id')
  @ApiOperation({ summary: 'Delete a review' })
  async deleteReview(@Param('id') id: string) {
    return this.adminService.deleteReview(id);
  }

  @Post('announcements')
  @ApiOperation({ summary: 'Broadcast system announcement to active users' })
  async broadcastAnnouncement(
    @Body() body: {
      title: string;
      message: string;
      targetRole?: 'citizen' | 'lawyer' | 'admin' | 'all';
      actionUrl?: string;
    },
  ) {
    return this.adminService.broadcastAnnouncement(body.title, body.message, body.targetRole, body.actionUrl);
  }

  @Get('chat-violations')
  @ApiOperation({ summary: 'Get chat policy violations (admin)' })
  @ApiQuery({ name: 'violationType', required: false, enum: Object.values(ChatViolationType) })
  @ApiQuery({ name: 'senderId', required: false })
  @ApiQuery({ name: 'appointmentId', required: false })
  @ApiQuery({ name: 'startDate', required: false, description: 'ISO date' })
  @ApiQuery({ name: 'endDate', required: false, description: 'ISO date' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getChatViolations(@Query() query: any) {
    return this.adminService.getChatViolations(
      {
        violationType: query.violationType,
        senderId: query.senderId,
        appointmentId: query.appointmentId,
        startDate: query.startDate,
        endDate: query.endDate,
      },
      query.page ? parseInt(query.page) : 1,
      query.limit ? parseInt(query.limit) : 20,
    );
  }

  // ==================== Reports ====================

  @Get('reports/export/csv')
  @ApiOperation({ summary: 'Download report as CSV (UC-10)' })
  @ApiQuery({ name: 'type', required: true, enum: ['users', 'appointments', 'revenue'] })
  @ApiQuery({ name: 'startDate', required: true })
  @ApiQuery({ name: 'endDate', required: true })
  async exportReportsCsv(
    @Query('type') type: 'users' | 'appointments' | 'revenue',
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Res() res: Response,
  ) {
    const csv = await this.adminService.getReportsCsv(type, startDate, endDate);
    const filename = `report-${type}-${startDate}-to-${endDate}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  }

  @Get('reports/:type')
  @ApiOperation({ summary: 'Get report data' })
  @ApiQuery({ name: 'startDate', required: true })
  @ApiQuery({ name: 'endDate', required: true })
  async getReports(
    @Param('type') type: 'users' | 'appointments' | 'revenue',
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.adminService.getReports(type, startDate, endDate);
  }

  // ==================== Complaint Management ====================

  @Get('complaints')
  @ApiOperation({ summary: 'Get all complaints (admin)' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'category', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getComplaints(@Query() query: any) {
    return this.complaintService.getAdminComplaints({
      status: query.status,
      category: query.category,
      page: query.page ? parseInt(query.page) : 1,
      limit: query.limit ? parseInt(query.limit) : 20,
    });
  }

  @Get('complaints/:id')
  @ApiOperation({ summary: 'Get complaint by ID (admin)' })
  async getComplaintById(@Param('id') id: string, @Query() _q: any, @Req() req: any) {
    return this.complaintService.getById(id, req.user?.userId, true);
  }

  @Patch('complaints/:id')
  @ApiOperation({ summary: 'Update complaint status / reply (admin)' })
  async updateComplaint(
    @Param('id') id: string,
    @Body() body: { status?: ComplaintStatus; adminReply?: string },
    @Req() req: any,
  ) {
    return this.complaintService.updateComplaint(id, req.user.userId, body);
  }

  // ==================== Email Testing ====================

  @Post('email/test')
  @ApiOperation({ summary: 'Send a test email to verify email configuration' })
  async sendTestEmail(@Body() body: { to: string }) {
    await this.emailService.sendTestEmail(body.to);
    return {
      success: true,
      message: `Test email sent to ${body.to}`,
    };
  }
}
