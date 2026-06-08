import { Controller, Get, Patch, Delete, Param, Query, UseGuards, Req, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { NotificationService } from '../services/notification.service';
import { AuthGuard } from '../auth/auth.guard';
import { CitizenKycGuard } from '../auth/citizen-kyc.guard';
import { IsBoolean, IsOptional } from 'class-validator';

class NotificationPreferencesDto {
  @IsOptional()
  @IsBoolean()
  inApp?: boolean;

  @IsOptional()
  @IsBoolean()
  email?: boolean;

  @IsOptional()
  @IsBoolean()
  sms?: boolean;
}

@ApiTags('Notifications')
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get('preferences')
  @UseGuards(AuthGuard, CitizenKycGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get notification preferences (UC-08)' })
  async getPreferences(@Req() req) {
    return this.notificationService.getNotificationPreferences(req.user.userId);
  }

  @Patch('preferences')
  @UseGuards(AuthGuard, CitizenKycGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update notification preferences (UC-08)' })
  async setPreferences(
    @Req() req,
    @Body() body: NotificationPreferencesDto,
  ) {
    return this.notificationService.setNotificationPreferences(req.user.userId, body);
  }

  @Get()
  @UseGuards(AuthGuard, CitizenKycGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get user notifications' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'unreadOnly', required: false, type: Boolean })
  async getNotifications(
    @Req() req,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('unreadOnly') unreadOnly?: string,
  ) {
    return this.notificationService.getUserNotifications(
      req.user.userId,
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 20,
      unreadOnly === 'true',
    );
  }

  @Get('unread-count')
  @UseGuards(AuthGuard, CitizenKycGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get unread notifications count' })
  async getUnreadCount(@Req() req) {
    return this.notificationService.getUnreadCount(req.user.userId);
  }

  @Patch(':id/read')
  @UseGuards(AuthGuard, CitizenKycGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mark notification as read' })
  async markAsRead(@Req() req, @Param('id') id: string) {
    return this.notificationService.markAsRead(id, req.user.userId);
  }

  @Patch('read-all')
  @UseGuards(AuthGuard, CitizenKycGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mark all notifications as read' })
  async markAllAsRead(@Req() req) {
    return this.notificationService.markAllAsRead(req.user.userId);
  }

  @Delete(':id')
  @UseGuards(AuthGuard, CitizenKycGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a notification' })
  async deleteNotification(@Req() req, @Param('id') id: string) {
    return this.notificationService.deleteNotification(id, req.user.userId);
  }

  @Delete()
  @UseGuards(AuthGuard, CitizenKycGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete all notifications' })
  async deleteAllNotifications(@Req() req) {
    return this.notificationService.deleteAllNotifications(req.user.userId);
  }
}
