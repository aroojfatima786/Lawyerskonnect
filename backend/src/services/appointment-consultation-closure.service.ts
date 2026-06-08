import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Appointment,
  AppointmentDocument,
  AppointmentStatus,
} from '../schemas/appointment.schema';
import { Message, MessageDocument } from '../schemas/message.schema';
import {
  Payment,
  PaymentDocument,
  PaymentStatus,
  PaymentType,
} from '../schemas/payment.schema';
import { NotificationService } from './notification.service';
import { NotificationType } from '../schemas/notification.schema';
import { PaymentService } from './payment.service';

const PKT_OFFSET_MINUTES = 5 * 60;

@Injectable()
export class AppointmentConsultationClosureService {
  private readonly logger = new Logger(AppointmentConsultationClosureService.name);

  constructor(
    @InjectModel(Appointment.name) private appointmentModel: Model<AppointmentDocument>,
    @InjectModel(Message.name) private messageModel: Model<MessageDocument>,
    @InjectModel(Payment.name) private paymentModel: Model<PaymentDocument>,
    private notificationService: NotificationService,
    private paymentService: PaymentService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleConsultationEndAutoClosure() {
    const now = new Date();
    const candidates = await this.appointmentModel
      .find({
        status: AppointmentStatus.CONFIRMED,
        consultationAutoClosedAt: { $exists: false },
      })
      .exec();

    if (!candidates.length) return;

    for (const appointment of candidates) {
      try {
        const endAt = this.buildAppointmentEndDateTime(appointment);
        if (now < endAt) continue;

        const isPaid =
          appointment.isPaid ||
          !!(await this.paymentModel.exists({
            appointmentId: appointment._id,
            status: PaymentStatus.COMPLETED,
            type: PaymentType.CONSULTATION_FEE,
          }));

        if (!isPaid) continue;

        const lawyerParticipated = await this.lawyerParticipatedDuringConsultation(appointment);
        if (lawyerParticipated) continue;

        await this.closeUnfulfilledConsultation(appointment);
      } catch (error) {
        this.logger.error(
          `Auto-close failed for appointment ${appointment._id}: ${(error as Error)?.message || error}`,
        );
      }
    }
  }

  private conversationIdFor(citizenId: string, lawyerId: string): string {
    const sorted = [citizenId, lawyerId].sort();
    return `${sorted[0]}_${sorted[1]}`;
  }

  private extractHourMinute(time: string): { hour: number; minute: number } {
    const raw = String(time || '').trim();
    const match = raw.match(/^(\d{1,2}):(\d{2})/);
    if (!match) return { hour: 0, minute: 0 };
    return { hour: Number(match[1]), minute: Number(match[2]) };
  }

  private buildAppointmentDateTime(appointmentDate: Date, time: string): Date {
    const { hour, minute } = this.extractHourMinute(time);
    const y = appointmentDate.getUTCFullYear();
    const mon = appointmentDate.getUTCMonth();
    const d = appointmentDate.getUTCDate();
    const utcMillis =
      Date.UTC(y, mon, d, hour, minute, 0, 0) - PKT_OFFSET_MINUTES * 60 * 1000;
    return new Date(utcMillis);
  }

  private buildAppointmentEndDateTime(appointment: AppointmentDocument): Date {
    if (String(appointment.endTime || '').trim()) {
      return this.buildAppointmentDateTime(appointment.appointmentDate, appointment.endTime);
    }
    const start = this.buildAppointmentDateTime(
      appointment.appointmentDate,
      appointment.startTime,
    );
    const duration =
      typeof appointment.duration === 'number' && appointment.duration > 0
        ? appointment.duration
        : 30;
    return new Date(start.getTime() + duration * 60 * 1000);
  }

  private async lawyerParticipatedDuringConsultation(
    appointment: AppointmentDocument,
  ): Promise<boolean> {
    const start = this.buildAppointmentDateTime(
      appointment.appointmentDate,
      appointment.startTime,
    );
    const end = this.buildAppointmentEndDateTime(appointment);
    const conversationId = this.conversationIdFor(
      appointment.citizenId.toString(),
      appointment.lawyerId.toString(),
    );

    const count = await this.messageModel.countDocuments({
      conversationId,
      senderId: appointment.lawyerId,
      createdAt: { $gte: start, $lte: end },
      isDeleted: { $ne: true },
    });

    return count > 0;
  }

  private async closeUnfulfilledConsultation(appointment: AppointmentDocument) {
    const reason =
      'Consultation time ended without lawyer participation in chat. Appointment closed automatically; payment refunded to citizen.';

    appointment.consultationAutoClosedAt = new Date();
    appointment.status = AppointmentStatus.CANCELLED;
    appointment.cancellationReason = reason;
    appointment.cancelledAt = new Date();
    await appointment.save();

    const payment = await this.paymentModel
      .findOne({
        appointmentId: appointment._id,
        type: PaymentType.CONSULTATION_FEE,
        status: PaymentStatus.COMPLETED,
      })
      .sort({ completedAt: -1, paidAt: -1 })
      .exec();

    if (payment) {
      await this.paymentService.processAutomaticConsultationRefund(
        payment._id.toString(),
        reason,
      );
    } else {
      appointment.isPaid = false;
      await appointment.save();
    }

    const appointmentId = appointment._id.toString();
    await Promise.all([
      this.notificationService.createNotification(
        appointment.citizenId.toString(),
        NotificationType.APPOINTMENT_CANCELLED,
        'Consultation closed — refund issued',
        'Your consultation window ended without a response from the lawyer. The appointment was closed and your payment was refunded.',
        { appointmentId },
        '/client/appointments',
      ),
      this.notificationService.createNotification(
        appointment.lawyerId.toString(),
        NotificationType.APPOINTMENT_CANCELLED,
        'Consultation closed automatically',
        'The consultation ended without you replying in chat. The appointment was cancelled and the client was refunded.',
        { appointmentId },
        '/lawyer/appointments',
      ),
    ]);

    this.logger.log(
      `Auto-closed unfulfilled consultation ${appointmentId} (lawyer did not participate in chat)`,
    );
  }
}
