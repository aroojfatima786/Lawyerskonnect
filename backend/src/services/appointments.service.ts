import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Appointment, AppointmentDocument, AppointmentStatus, ConsultationType } from '../schemas/appointment.schema';
import { User, UserDocument, UserRole, VerificationStatus } from '../schemas/user.schema';
import { NotificationService } from './notification.service';
import { PaymentService } from './payment.service';
import { ChatService } from './chat.service';
import { LawyerPlanLimitsService } from './lawyer-plan-limits.service';

export interface CreateAppointmentDto {
  lawyerId: string;
  appointmentDate: string;
  startTime: string;
  duration?: number;
  consultationType?: ConsultationType;
  description?: string;
  caseCategory?: string;
}

@Injectable()
export class AppointmentsService {
  private static readonly FREE_CONSULTATIONS_PER_LAWYER = 1;

  constructor(
    @InjectModel(Appointment.name) private appointmentModel: Model<AppointmentDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private notificationService: NotificationService,
    private paymentService: PaymentService,
    private chatService: ChatService,
    private planLimitsService: LawyerPlanLimitsService,
  ) {}

  // Create a new appointment
  async createAppointment(citizenId: string, dto: CreateAppointmentDto) {
    const {
      lawyerId,
      appointmentDate,
      startTime,
      duration = 30,
      description,
      caseCategory,
    } = dto;
    const consultationType = ConsultationType.ONLINE;

    // Prevent booking slots in the past (PK time).
    const nowPk = new Date(
      new Date().toLocaleString('en-US', {
        timeZone: 'Asia/Karachi',
      }),
    );
    const [reqHour, reqMin] = startTime.split(':').map((v) => Number(v || 0));
    const reqDate = new Date(`${appointmentDate}T00:00:00`);
    reqDate.setHours(reqHour, reqMin, 0, 0);
    if (reqDate.getTime() <= nowPk.getTime()) {
      throw new HttpException('Selected slot is in the past. Please choose a future time slot.', HttpStatus.BAD_REQUEST);
    }

    // Validate lawyer
    const lawyer = await this.userModel.findOne({
      _id: lawyerId,
      role: UserRole.LAWYER,
      'lawyerProfile.verificationStatus': VerificationStatus.VERIFIED,
    });

    if (!lawyer) {
      throw new HttpException('Lawyer not found or not verified', HttpStatus.NOT_FOUND);
    }

    await this.planLimitsService.assertLawyerCanReceiveAppointment(lawyerId);

    const lawyerPracticeAreas = lawyer.lawyerProfile?.practiceAreas ?? [];
    if (lawyerPracticeAreas.length > 0) {
      const chosen = String(caseCategory || '').trim();
      if (!chosen || !lawyerPracticeAreas.includes(chosen)) {
        throw new HttpException(
          'Please select a practice area from this lawyer\'s profile',
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    // Calculate end time
    const [startHour, startMin] = startTime.split(':').map(Number);
    let endHour = startHour;
    let endMin = startMin + duration;
    if (endMin >= 60) {
      endHour += Math.floor(endMin / 60);
      endMin = endMin % 60;
    }
    const endTime = `${endHour.toString().padStart(2, '0')}:${endMin.toString().padStart(2, '0')}`;

    // Check if slot is available
    const dateObj = new Date(appointmentDate);
    const startOfDay = new Date(dateObj);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(dateObj);
    endOfDay.setHours(23, 59, 59, 999);

    const conflictingAppointment = await this.appointmentModel.findOne({
      lawyerId,
      appointmentDate: { $gte: startOfDay, $lte: endOfDay },
      startTime,
      status: { $in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED] },
    });

    if (conflictingAppointment) {
      throw new HttpException('This time slot is not available', HttpStatus.CONFLICT);
    }

    // First booking with a lawyer is free; every later booking uses lawyer fee (even if prior visits are not completed yet).
    const priorBookingsWithLawyer = await this.appointmentModel.countDocuments({
      citizenId: new Types.ObjectId(citizenId),
      lawyerId: new Types.ObjectId(lawyerId),
      status: {
        $nin: [AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW],
      },
    });
    const lawyerFee = lawyer.lawyerProfile?.consultationFee || 0;
    const fee =
      priorBookingsWithLawyer < AppointmentsService.FREE_CONSULTATIONS_PER_LAWYER ? 0 : lawyerFee;
    const isFreeConsultation = fee === 0;

    // Create appointment
    const appointment = new this.appointmentModel({
      citizenId: new Types.ObjectId(citizenId),
      lawyerId: new Types.ObjectId(lawyerId),
      appointmentDate: dateObj,
      startTime,
      endTime,
      duration,
      consultationType,
      description,
      caseCategory,
      fee,
      status: AppointmentStatus.PENDING,
      isPaid: isFreeConsultation, // Free consultations count as "paid" so no Pay Now
    });

    await appointment.save();

    await this.chatService.ensureConversationForAppointment(
      appointment.citizenId.toString(),
      appointment.lawyerId.toString(),
      appointment._id.toString(),
    );

    // Admin: notify when unpaid consultation (fee > 0) - until case complete / payment done
    if (fee > 0) {
      this.notificationService
        .notifyAdminsPendingPayment(
          'Unpaid consultation booked',
          'A citizen has booked a consultation but has not paid yet. Payment required until case is complete.',
          { appointmentId: appointment._id.toString(), lawyerId, citizenId },
          '/admin/payments',
        )
        .catch(() => {});
    }

    // Send notifications: citizen gets "booked", lawyer gets "confirm appointment"
    await Promise.all([
      this.notificationService.createAppointmentNotification(citizenId, 'booked', appointment, {
        actionUrl: '/client/appointments',
      }),
      this.notificationService.createAppointmentNotification(lawyerId, 'booked', appointment, {
        forLawyer: true,
        actionUrl: `/lawyer/appointments`,
      }),
    ]);

    const idStr = appointment._id.toString();
    return {
      success: true,
      message: 'Appointment booked successfully',
      data: {
        ...appointment.toObject(),
        _id: idStr,
        id: idStr,
      },
    };
  }

  // Get appointments for a citizen
  async getCitizenAppointments(citizenId: string, status?: string, page = 1, limit = 10) {
    const query: any = { citizenId: new Types.ObjectId(citizenId) };
    if (status) {
      const statuses = status.split(',').map((s) => s.trim()).filter(Boolean);
      query.status = statuses.length > 1 ? { $in: statuses } : statuses[0];
    }

    const skip = (page - 1) * limit;

    const [appointments, total] = await Promise.all([
      this.appointmentModel
        .find(query)
        .populate('lawyerId', 'email lawyerProfile.fullName lawyerProfile.profilePictureUrl lawyerProfile.practiceAreas')
        .sort({ appointmentDate: -1, startTime: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.appointmentModel.countDocuments(query),
    ]);

    return {
      success: true,
      data: appointments,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // Get appointments for a lawyer
  async getLawyerAppointments(lawyerId: string, status?: string, date?: string, page = 1, limit = 10) {
    const query: any = { lawyerId: new Types.ObjectId(lawyerId) };

    if (status) {
      const statuses = status.split(',').map((s) => s.trim()).filter(Boolean);
      query.status = statuses.length > 1 ? { $in: statuses } : statuses[0];
    }

    if (date) {
      const dateObj = new Date(date);
      const startOfDay = new Date(dateObj);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(dateObj);
      endOfDay.setHours(23, 59, 59, 999);
      query.appointmentDate = { $gte: startOfDay, $lte: endOfDay };
    }

    const skip = (page - 1) * limit;

    const [appointments, total] = await Promise.all([
      this.appointmentModel
        .find(query)
        .populate('citizenId', 'email citizenProfile.fullName citizenProfile.phoneNumber')
        .sort({ appointmentDate: 1, startTime: 1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.appointmentModel.countDocuments(query),
    ]);

    return {
      success: true,
      data: appointments,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // Get single appointment by ID
  async getAppointmentById(appointmentId: string, userId: string) {
    let aid: Types.ObjectId;
    let uid: Types.ObjectId;
    try {
      aid = new Types.ObjectId(appointmentId);
      uid = new Types.ObjectId(userId);
    } catch {
      throw new HttpException('Invalid appointment or user id', HttpStatus.BAD_REQUEST);
    }

    const appointment = await this.appointmentModel
      .findOne({
        _id: aid,
        $or: [{ citizenId: uid }, { lawyerId: uid }],
      })
      .populate('citizenId', 'email citizenProfile.fullName citizenProfile.phoneNumber citizenProfile.profilePictureUrl')
      .populate('lawyerId', 'email lawyerProfile.fullName lawyerProfile.phoneNumber lawyerProfile.profilePictureUrl lawyerProfile.officeAddress')
      .exec();

    if (!appointment) {
      throw new HttpException('Appointment not found', HttpStatus.NOT_FOUND);
    }

    return { success: true, data: appointment };
  }

  // Confirm appointment (lawyer only)
  async confirmAppointment(appointmentId: string, lawyerId: string, meetingLink?: string) {
    const lid = new Types.ObjectId(lawyerId);
    const appointment = await this.appointmentModel.findOne({
      _id: appointmentId,
      lawyerId: lid,
      status: AppointmentStatus.PENDING,
    });

    if (!appointment) {
      throw new HttpException('Appointment not found or cannot be confirmed', HttpStatus.NOT_FOUND);
    }

    appointment.status = AppointmentStatus.CONFIRMED;
    if (meetingLink) {
      appointment.meetingLink = meetingLink;
    }

    await appointment.save();

    // Send notifications with payment/chat entry routes
    const citizenActionUrl =
      appointment.fee > 0 && !appointment.isPaid
        ? `/client/payments/checkout/${appointment._id.toString()}`
        : '/client/messages';
    await Promise.all([
      this.notificationService.createAppointmentNotification(
        appointment.citizenId.toString(),
        'confirmed',
        appointment,
        { actionUrl: citizenActionUrl },
      ),
      this.notificationService.createAppointmentNotification(
        appointment.lawyerId.toString(),
        'confirmed',
        appointment,
        { actionUrl: '/lawyer/appointments' },
      ),
    ]);

    return {
      success: true,
      message: 'Appointment confirmed',
      data: appointment,
    };
  }

  // Cancel appointment
  async cancelAppointment(appointmentId: string, userId: string, reason: string) {
    const uid = new Types.ObjectId(userId);
    const appointment = await this.appointmentModel.findOne({
      _id: appointmentId,
      $or: [{ citizenId: uid }, { lawyerId: uid }],
      status: { $in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED] },
    });

    if (!appointment) {
      throw new HttpException('Appointment not found or cannot be cancelled', HttpStatus.NOT_FOUND);
    }

    appointment.status = AppointmentStatus.CANCELLED;
    appointment.cancellationReason = reason;
    appointment.cancelledBy = new Types.ObjectId(userId);
    appointment.cancelledAt = new Date();

    await appointment.save();

    // Send notifications to both parties with role-based action URLs
    const lawyerIdStr = appointment.lawyerId.toString();
    const citizenIdStr = appointment.citizenId.toString();
    await Promise.all([
      this.notificationService.createAppointmentNotification(lawyerIdStr, 'cancelled', appointment, {
        actionUrl: '/lawyer/appointments',
      }),
      this.notificationService.createAppointmentNotification(citizenIdStr, 'cancelled', appointment, {
        actionUrl: '/client/appointments',
      }),
    ]);

    return {
      success: true,
      message: 'Appointment cancelled',
      data: appointment,
    };
  }

  // Reschedule appointment
  async rescheduleAppointment(
    appointmentId: string,
    userId: string,
    newDate: string,
    newStartTime: string,
    reason: string,
  ) {
    const uid = new Types.ObjectId(userId);
    const appointment = await this.appointmentModel.findOne({
      _id: appointmentId,
      $or: [{ citizenId: uid }, { lawyerId: uid }],
      status: { $in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED] },
    });

    if (!appointment) {
      throw new HttpException('Appointment not found or cannot be rescheduled', HttpStatus.NOT_FOUND);
    }

    // Check if new slot is available
    const dateObj = new Date(newDate);
    const startOfDay = new Date(dateObj);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(dateObj);
    endOfDay.setHours(23, 59, 59, 999);

    const conflictingAppointment = await this.appointmentModel.findOne({
      _id: { $ne: appointmentId },
      lawyerId: appointment.lawyerId,
      appointmentDate: { $gte: startOfDay, $lte: endOfDay },
      startTime: newStartTime,
      status: { $in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED] },
    });

    if (conflictingAppointment) {
      throw new HttpException('New time slot is not available', HttpStatus.CONFLICT);
    }

    // Calculate new end time
    const [startHour, startMin] = newStartTime.split(':').map(Number);
    let endHour = startHour;
    let endMin = startMin + appointment.duration;
    if (endMin >= 60) {
      endHour += Math.floor(endMin / 60);
      endMin = endMin % 60;
    }
    const newEndTime = `${endHour.toString().padStart(2, '0')}:${endMin.toString().padStart(2, '0')}`;

    // Save original date
    appointment.originalDate = appointment.appointmentDate;
    appointment.originalStartTime = appointment.startTime;

    // Update with new date/time
    appointment.appointmentDate = dateObj;
    appointment.startTime = newStartTime;
    appointment.endTime = newEndTime;
    appointment.rescheduleReason = reason;
    appointment.rescheduledBy = new Types.ObjectId(userId);
    appointment.status = AppointmentStatus.PENDING; // Reset to pending for reconfirmation

    await appointment.save();

    // Send notifications with role-based action URLs
    const lawyerIdStr = appointment.lawyerId.toString();
    const citizenIdStr = appointment.citizenId.toString();
    await Promise.all([
      this.notificationService.createAppointmentNotification(lawyerIdStr, 'rescheduled', appointment, {
        actionUrl: '/lawyer/appointments',
      }),
      this.notificationService.createAppointmentNotification(citizenIdStr, 'rescheduled', appointment, {
        actionUrl: '/client/appointments',
      }),
    ]);

    return {
      success: true,
      message: 'Appointment rescheduled',
      data: appointment,
    };
  }

  // Complete appointment (lawyer only)
  async completeAppointment(appointmentId: string, lawyerId: string, notes?: string) {
    const lid = new Types.ObjectId(lawyerId);
    const appointment = await this.appointmentModel.findOne({
      _id: appointmentId,
      lawyerId: lid,
      status: AppointmentStatus.CONFIRMED,
    });

    if (!appointment) {
      throw new HttpException('Appointment not found or cannot be completed', HttpStatus.NOT_FOUND);
    }

    appointment.status = AppointmentStatus.COMPLETED;
    appointment.completedAt = new Date();
    if (notes) {
      appointment.lawyerNotes = notes;
    }

    await appointment.save();

    // Update lawyer's total consultations
    await this.userModel.updateOne(
      { _id: lid },
      { $inc: { 'lawyerProfile.totalConsultations': 1 } },
    );

    // Payout is auto-released when consultation completes (if lawyer payout account is on file).

    // Send completion notification to citizen
    await this.notificationService.createAppointmentNotification(
      appointment.citizenId.toString(),
      'completed',
      appointment,
      { actionUrl: '/client/appointments' },
    );

    // Escrow -> payout eligibility transition happens only after consultation completion.
    await this.paymentService
      .ensurePayoutEligibilityForCompletedAppointment(appointment._id.toString())
      .catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[PayoutEligibility] Failed after appointment completion:', msg);
      });

    return {
      success: true,
      message: 'Appointment marked as completed',
      data: appointment,
    };
  }

  // Get upcoming / actionable appointments (pending + confirmed) so lawyer can confirm/cancel, citizen can see their bookings
  async getUpcomingAppointments(userId: string, role: string, limit = 10) {
    const uid = new Types.ObjectId(userId);
    const query: any = {
      status: { $in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED] },
    };

    if (role === UserRole.LAWYER) {
      query.lawyerId = uid;
    } else {
      query.citizenId = uid;
    }

    const appointments = await this.appointmentModel
      .find(query)
      .populate('citizenId', 'email citizenProfile.fullName citizenProfile.profilePictureUrl')
      .populate('lawyerId', 'email lawyerProfile.fullName lawyerProfile.profilePictureUrl')
      .sort({ appointmentDate: 1, startTime: 1 })
      .limit(limit)
      .exec();

    return { success: true, data: appointments };
  }

  // Get appointment statistics
  async getAppointmentStats(userId: string, role: string) {
    const userField = role === UserRole.LAWYER ? 'lawyerId' : 'citizenId';

    const stats = await this.appointmentModel.aggregate([
      { $match: { [userField]: new Types.ObjectId(userId) } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
        },
      },
    ]);

    const result: Record<string, number> = {
      total: 0,
      pending: 0,
      confirmed: 0,
      completed: 0,
      cancelled: 0,
    };

    stats.forEach((s) => {
      result[s._id] = s.count;
      result.total += s.count;
    });

    return { success: true, data: result };
  }

  // Update appointment meeting link (lawyer only)
  async updateMeetingLink(appointmentId: string, lawyerId: string, meetingLink: string, meetingPassword?: string) {
    const lid = new Types.ObjectId(lawyerId);
    const appointment = await this.appointmentModel.findOneAndUpdate(
      {
        _id: appointmentId,
        lawyerId: lid,
        status: { $in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED] },
      },
      { meetingLink, meetingPassword },
      { new: true },
    );

    if (!appointment) {
      throw new HttpException('Appointment not found', HttpStatus.NOT_FOUND);
    }

    return {
      success: true,
      message: 'Meeting link updated',
      data: appointment,
    };
  }
}
