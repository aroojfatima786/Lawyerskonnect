import { Controller, Get, Post, Patch, Param, Query, Body, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AppointmentsService } from '../services/appointments.service';
import { AuthGuard } from '../auth/auth.guard';
import { CitizenKycGuard } from '../auth/citizen-kyc.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../schemas/user.schema';
import {
  CreateAppointmentDto,
  ConfirmAppointmentDto,
  CancelAppointmentDto,
  RescheduleAppointmentDto,
  CompleteAppointmentDto,
  UpdateMeetingLinkDto,
} from '../dto/appointment.dto';

@ApiTags('Appointments')
@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Post()
  @UseGuards(AuthGuard, CitizenKycGuard, RolesGuard)
  @Roles(UserRole.CITIZEN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Book a new appointment (citizen only)' })
  async createAppointment(@Req() req, @Body() body: CreateAppointmentDto) {
    return this.appointmentsService.createAppointment(req.user.userId, body);
  }

  @Get('citizen')
  @UseGuards(AuthGuard, CitizenKycGuard, RolesGuard)
  @Roles(UserRole.CITIZEN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get citizen appointments' })
  @ApiQuery({ name: 'status', required: false, description: 'Comma-separated: pending,confirmed,completed,cancelled' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getCitizenAppointments(
    @Req() req,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.appointmentsService.getCitizenAppointments(
      req.user.userId,
      status,
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 10,
    );
  }

  @Get('lawyer')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.LAWYER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get lawyer appointments' })
  @ApiQuery({ name: 'status', required: false, description: 'Comma-separated: pending,confirmed,completed,cancelled' })
  @ApiQuery({ name: 'date', required: false, description: 'Filter by date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getLawyerAppointments(
    @Req() req,
    @Query('status') status?: string,
    @Query('date') date?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.appointmentsService.getLawyerAppointments(
      req.user.userId,
      status,
      date,
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 10,
    );
  }

  @Get('upcoming')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get upcoming appointments' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getUpcomingAppointments(@Req() req, @Query('limit') limit?: string) {
    return this.appointmentsService.getUpcomingAppointments(
      req.user.userId,
      req.user.role,
      limit ? parseInt(limit) : 5,
    );
  }

  @Get('stats')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get appointment statistics' })
  async getAppointmentStats(@Req() req) {
    return this.appointmentsService.getAppointmentStats(req.user.userId, req.user.role);
  }

  @Get(':id')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get appointment by ID' })
  async getAppointmentById(@Req() req, @Param('id') id: string) {
    return this.appointmentsService.getAppointmentById(id, req.user.userId);
  }

  @Patch(':id/confirm')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.LAWYER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Confirm appointment (lawyer only)' })
  async confirmAppointment(
    @Req() req,
    @Param('id') id: string,
    @Body() body: ConfirmAppointmentDto,
  ) {
    return this.appointmentsService.confirmAppointment(id, req.user.userId, body.meetingLink);
  }

  @Patch(':id/cancel')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cancel appointment' })
  async cancelAppointment(
    @Req() req,
    @Param('id') id: string,
    @Body() body: CancelAppointmentDto,
  ) {
    return this.appointmentsService.cancelAppointment(id, req.user.userId, body.reason);
  }

  @Patch(':id/reschedule')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Reschedule appointment' })
  async rescheduleAppointment(
    @Req() req,
    @Param('id') id: string,
    @Body() body: RescheduleAppointmentDto,
  ) {
    return this.appointmentsService.rescheduleAppointment(
      id,
      req.user.userId,
      body.newDate,
      body.newStartTime,
      body.reason,
    );
  }

  @Patch(':id/complete')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.LAWYER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mark appointment as completed (lawyer only)' })
  async completeAppointment(
    @Req() req,
    @Param('id') id: string,
    @Body() body: CompleteAppointmentDto,
  ) {
    return this.appointmentsService.completeAppointment(id, req.user.userId, body.notes);
  }

  @Patch(':id/meeting-link')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.LAWYER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update meeting link (lawyer only)' })
  async updateMeetingLink(
    @Req() req,
    @Param('id') id: string,
    @Body() body: UpdateMeetingLinkDto,
  ) {
    return this.appointmentsService.updateMeetingLink(
      id,
      req.user.userId,
      body.meetingLink,
      body.meetingPassword,
    );
  }
}
