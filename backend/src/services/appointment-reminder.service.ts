import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Appointment, AppointmentDocument, AppointmentStatus } from '../schemas/appointment.schema';
import { NotificationService } from './notification.service';
import { NotificationType } from '../schemas/notification.schema';

@Injectable()
export class AppointmentReminderService {
  private readonly logger = new Logger(AppointmentReminderService.name);

  constructor(
    @InjectModel(Appointment.name) private appointmentModel: Model<AppointmentDocument>,
    private notificationService: NotificationService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleAppointmentReminders() {
    const now = new Date();
    const queryEnd = new Date(now.getTime() + 2 * 60 * 60 * 1000); // Next 2 hours

    const appointments = await this.appointmentModel
      .find({
        status: AppointmentStatus.CONFIRMED,
        reminderSent: false,
        appointmentDate: { $gte: new Date(now.getTime() - 24 * 60 * 60 * 1000), $lte: queryEnd },
      })
      .exec();

    if (!appointments.length) {
      return;
    }

    await Promise.all(
      appointments.map(async (appointment) => {
        try {
          const appointmentDateTime = this.getAppointmentDateTime(appointment.appointmentDate, appointment.startTime);
          const diffMs = appointmentDateTime.getTime() - now.getTime();

          if (diffMs < 55 * 60 * 1000 || diffMs > 65 * 60 * 1000) {
            return;
          }

          await Promise.all([
            this.notificationService.createAppointmentNotification(
              appointment.citizenId.toString(),
              'reminder',
              appointment,
              {
                actionUrl:
                  appointment.fee > 0 && !appointment.isPaid
                    ? `/client/payments/checkout/${appointment._id.toString()}`
                    : '/client/messages',
              },
            ),
            this.notificationService.createAppointmentNotification(
              appointment.lawyerId.toString(),
              'reminder',
              appointment,
              { actionUrl: appointment.isPaid ? '/lawyer/messages' : '/lawyer/appointments' },
            ),
          ]);

          appointment.reminderSent = true;
          appointment.reminderSentAt = new Date();
          await appointment.save();
        } catch (error) {
          this.logger.error('Error sending appointment reminder', error as any);
        }
      }),
    );
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleConsultationStartNotifications() {
    const now = new Date();

    const appointments = await this.appointmentModel
      .find({
        status: AppointmentStatus.CONFIRMED,
        isPaid: true,
        consultationStartNotified: false,
        appointmentDate: { $lte: now },
      })
      .exec();

    if (!appointments.length) {
      return;
    }

    await Promise.all(
      appointments.map(async (appointment) => {
        try {
          const appointmentStart = this.getAppointmentDateTime(
            appointment.appointmentDate,
            appointment.startTime,
          );
          if (appointmentStart > now) {
            return;
          }

          const appointmentId = appointment._id.toString();
          await Promise.all([
            this.notificationService.createNotification(
              appointment.citizenId.toString(),
              NotificationType.APPOINTMENT_REMINDER,
              'Consultation started',
              'Your consultation time has started. You can now message your lawyer.',
              { appointmentId },
              `/client/messages?appointmentId=${appointmentId}`,
            ),
            this.notificationService.createNotification(
              appointment.lawyerId.toString(),
              NotificationType.APPOINTMENT_REMINDER,
              'Consultation started',
              'Your consultation with the client has started. You can now message the client.',
              { appointmentId },
              `/lawyer/messages?appointmentId=${appointmentId}`,
            ),
          ]);

          appointment.consultationStartNotified = true;
          appointment.consultationStartNotifiedAt = now;
          await appointment.save();
        } catch (error) {
          this.logger.error('Error sending consultation-start notification', error as any);
        }
      }),
    );
  }

  private getAppointmentDateTime(appointmentDate: Date, startTime: string): Date {
    const [hours, minutes] = (startTime || '00:00').split(':').map((value) => parseInt(value, 10) || 0);
    const result = new Date(appointmentDate);
    result.setHours(hours, minutes, 0, 0);
    return result;
  }
}
