import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { fetch } from 'undici';
import { Notification, NotificationDocument, NotificationType } from '../schemas/notification.schema';
import { User, UserDocument, UserRole } from '../schemas/user.schema';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EmailService } from './email.service';
import { SmsService } from './sms.service';

@Injectable()
export class NotificationService {
  private notificationWebhookUrl?: string;

  constructor(
    @InjectModel(Notification.name) private notificationModel: Model<NotificationDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private eventEmitter: EventEmitter2,
    private configService: ConfigService,
    private emailService: EmailService,
    private smsService: SmsService,
  ) {
    this.notificationWebhookUrl = this.configService.get<string>('NOTIFICATION_WEBHOOK_URL');
  }

  // Create a notification (UC-08: respect user preferences - skip if inApp disabled)
  async createNotification(
    userId: string,
    type: NotificationType,
    title: string,
    message: string,
    data?: Record<string, any>,
    actionUrl?: string,
    options?: { sendEmail?: boolean; sendSms?: boolean },
  ) {
    const user = await this.userModel
      .findById(userId)
      .select('notificationPreferences email citizenProfile.phoneNumber lawyerProfile.phoneNumber')
      .lean()
      .exec();
    const prefs = user?.notificationPreferences as { inApp?: boolean; email?: boolean; sms?: boolean } | undefined;
    const phoneNumber = user?.citizenProfile?.phoneNumber || user?.lawyerProfile?.phoneNumber;

    // Create in-app notification if enabled
    let notification: NotificationDocument | null = null;
    if (prefs?.inApp !== false) {
      notification = new this.notificationModel({
        userId: new Types.ObjectId(userId),
        type,
        title,
        message,
        data,
        actionUrl,
      });

      await notification.save();
    }

    // Send email if enabled
    const allowEmail = options?.sendEmail !== false;
    if (allowEmail && prefs?.email !== false && user?.email) {
      try {
        await this.emailService.sendNotificationEmail(user.email, title, message, actionUrl);
      } catch (error) {
        console.error('Failed to send notification email:', error);
        // Don't fail the notification creation if email fails
      }
    }

    // Send SMS if enabled and phone is available
    const allowSms = options?.sendSms !== false;
    if (allowSms && prefs?.sms !== false && phoneNumber) {
      try {
        await this.smsService.sendSms(phoneNumber, `${title}\n\n${message}`);
      } catch (error) {
        console.error('Failed to send SMS notification:', error);
      }
    }

    // Send to external webhook
    await this.sendExternalNotification(userId, type, title, message, data, actionUrl);

    // Emit event for real-time notification (will be caught by WebSocket gateway)
    this.eventEmitter.emit('notification.created', {
      userId,
      notification,
    });

    return notification;
  }

  private async sendExternalNotification(
    userId: string,
    type: NotificationType,
    title: string,
    message: string,
    data?: Record<string, any>,
    actionUrl?: string,
  ) {
    if (!this.notificationWebhookUrl) {
      return;
    }

    try {
      await fetch(this.notificationWebhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          type,
          title,
          message,
          data,
          actionUrl,
        }),
      });
    } catch (error) {
      console.error('External notification webhook failed:', error);
    }
  }

  // Get user notifications
  async getUserNotifications(userId: string, page = 1, limit = 20, unreadOnly = false) {
    const uid = new Types.ObjectId(userId);
    const query: any = { userId: uid, isDeleted: false };
    if (unreadOnly) {
      query.isRead = false;
    }

    const skip = (page - 1) * limit;

    const [notifications, total, unreadCount] = await Promise.all([
      this.notificationModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.notificationModel.countDocuments(query),
      this.notificationModel.countDocuments({ userId: uid, isRead: false, isDeleted: false }),
    ]);

    return {
      success: true,
      data: notifications,
      unreadCount,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // Mark notification as read
  async markAsRead(notificationId: string, userId: string) {
    const uid = new Types.ObjectId(userId);
    const notification = await this.notificationModel.findOneAndUpdate(
      { _id: notificationId, userId: uid },
      { isRead: true, readAt: new Date() },
      { new: true },
    );

    return { success: true, data: notification };
  }

  // Mark all notifications as read
  async markAllAsRead(userId: string) {
    const uid = new Types.ObjectId(userId);
    await this.notificationModel.updateMany(
      { userId: uid, isRead: false, isDeleted: false },
      { isRead: true, readAt: new Date() },
    );

    return { success: true, message: 'All notifications marked as read' };
  }

  // Delete a notification
  async deleteNotification(notificationId: string, userId: string) {
    const uid = new Types.ObjectId(userId);
    await this.notificationModel.updateOne(
      { _id: notificationId, userId: uid },
      { isDeleted: true },
    );

    return { success: true, message: 'Notification deleted' };
  }

  // Delete all notifications for a user
  async deleteAllNotifications(userId: string) {
    const uid = new Types.ObjectId(userId);
    await this.notificationModel.updateMany(
      { userId: uid, isDeleted: false },
      { isDeleted: true },
    );

    return { success: true, message: 'All notifications deleted' };
  }

  // Get unread count
  async getUnreadCount(userId: string) {
    const uid = new Types.ObjectId(userId);
    const count = await this.notificationModel.countDocuments({
      userId: uid,
      isRead: false,
      isDeleted: false,
    });

    return { success: true, count };
  }

  // ==================== Notification Helpers ====================

  // Appointment notifications
  async createAppointmentNotification(
    userId: string,
    type: 'booked' | 'confirmed' | 'cancelled' | 'rescheduled' | 'reminder' | 'completed',
    appointmentData: any,
    options?: { forLawyer?: boolean; actionUrl?: string },
  ) {
    const typeMap: Record<string, { type: NotificationType; title: string; message: string }> = {
      booked: {
        type: NotificationType.APPOINTMENT_BOOKED,
        title: options?.forLawyer ? 'Confirm Appointment' : 'New Appointment Booked',
        message: options?.forLawyer
          ? 'A client has requested an appointment. Please confirm.'
          : `Appointment scheduled for ${new Date(appointmentData.appointmentDate).toLocaleDateString()} at ${appointmentData.startTime}`,
      },
      confirmed: {
        type: NotificationType.APPOINTMENT_CONFIRMED,
        title: 'Appointment Confirmed',
        message: `Your appointment for ${new Date(appointmentData.appointmentDate).toLocaleDateString()} has been confirmed`,
      },
      cancelled: {
        type: NotificationType.APPOINTMENT_CANCELLED,
        title: 'Appointment Cancelled',
        message: `The appointment for ${new Date(appointmentData.appointmentDate).toLocaleDateString()} has been cancelled`,
      },
      rescheduled: {
        type: NotificationType.APPOINTMENT_RESCHEDULED,
        title: 'Appointment Rescheduled',
        message: `Your appointment has been rescheduled to ${new Date(appointmentData.appointmentDate).toLocaleDateString()} at ${appointmentData.startTime}`,
      },
      reminder: {
        type: NotificationType.APPOINTMENT_REMINDER,
        title: 'Appointment Reminder',
        message: `Reminder: You have an appointment in 1 hour at ${appointmentData.startTime}`,
      },
      completed: {
        type: NotificationType.APPOINTMENT_COMPLETED,
        title: 'Appointment Completed',
        message: `Your consultation has been completed. Please leave a review!`,
      },
    };

    const config = typeMap[type];
    const actionUrl = options?.actionUrl ?? '/client/appointments';
    return this.createNotification(
      userId,
      config.type,
      config.title,
      config.message,
      { appointmentId: appointmentData._id || appointmentData.id },
      actionUrl,
    );
  }

  // Payment notifications
  async createPaymentNotification(
    userId: string,
    type: 'payment_sent' | 'payment_received' | 'payment_failed' | 'refund',
    paymentData: any,
    options?: { actionUrl?: string },
  ) {
    const typeMap: Record<string, { type: NotificationType; title: string; message: string }> = {
      payment_sent: {
        type: NotificationType.PAYMENT_SENT,
        title: 'Payment Successful',
        message: `Your payment of PKR ${paymentData.amount} was successful`,
      },
      payment_received: {
        type: NotificationType.PAYMENT_RECEIVED,
        title: 'Payment Received',
        message: `You received a payment of PKR ${(paymentData as any).lawyerAmount ?? paymentData.amount} for the consultation`,
      },
      payment_failed: {
        type: NotificationType.PAYMENT_FAILED,
        title: 'Payment Failed',
        message: `Your payment of PKR ${paymentData.amount} could not be completed. Reason: ${(paymentData.gatewayResponse?.reason ?? 'Please try again.')}`,
      },
      refund: {
        type: NotificationType.REFUND_PROCESSED,
        title: 'Refund Processed',
        message: `A refund of PKR ${paymentData.amount} has been processed`,
      },
    };

    const config = typeMap[type];
    const appointmentId =
      paymentData?.appointmentId?._id?.toString?.() ||
      paymentData?.appointmentId?.toString?.() ||
      paymentData?.appointmentId;
    const defaultUrl = appointmentId
      ? `/client/payments/checkout/${appointmentId}`
      : '/client/payments/history';
    return this.createNotification(
      userId,
      config.type,
      config.title,
      config.message,
      { paymentId: paymentData._id || paymentData.id },
      options?.actionUrl ?? defaultUrl,
    );
  }

  // Verification notifications
  async createVerificationNotification(
    userId: string,
    type: 'submitted' | 'approved' | 'rejected',
    reason?: string,
  ) {
    const typeMap: Record<string, { type: NotificationType; title: string; message: string }> = {
      submitted: {
        type: NotificationType.VERIFICATION_SUBMITTED,
        title: 'Verification Submitted',
        message: 'Your verification documents have been submitted for review',
      },
      approved: {
        type: NotificationType.VERIFICATION_APPROVED,
        title: 'Verification Approved',
        message: 'Congratulations! Your profile has been verified',
      },
      rejected: {
        type: NotificationType.VERIFICATION_REJECTED,
        title: 'Verification Rejected',
        message: reason || 'Your verification was rejected. Please resubmit with correct documents',
      },
    };

    const config = typeMap[type];
    return this.createNotification(
      userId,
      config.type,
      config.title,
      config.message,
      {},
      '/lawyer/profile',
    );
  }

  // Message notification
  async createMessageNotification(userId: string, senderName: string, conversationId: string) {
    const recipient = await this.userModel.findById(userId).select('role').lean().exec();
    const basePath = recipient?.role === UserRole.LAWYER ? '/lawyer/messages' : '/client/messages';
    return this.createNotification(
      userId,
      NotificationType.NEW_MESSAGE,
      'New Message',
      `You have a new message from ${senderName}`,
      { conversationId },
      `${basePath}?conversationId=${conversationId}`,
      { sendEmail: false, sendSms: false },
    );
  }

  // Review notification
  async createReviewNotification(lawyerId: string, rating: number, citizenName: string) {
    return this.createNotification(
      lawyerId,
      NotificationType.NEW_REVIEW,
      'New Review',
      `${citizenName} left you a ${rating}-star review`,
      {},
      '/lawyer/reviews',
    );
  }

  // UC-08: Get / set notification preferences
  async getNotificationPreferences(userId: string) {
    const user = await this.userModel.findById(userId).select('notificationPreferences').lean().exec();
    return {
      success: true,
      data: user?.notificationPreferences ?? { inApp: true, email: true, sms: true },
    };
  }

  async setNotificationPreferences(
    userId: string,
    prefs: { inApp?: boolean; email?: boolean; sms?: boolean },
  ) {
    await this.userModel.updateOne(
      { _id: new Types.ObjectId(userId) },
      { $set: { notificationPreferences: prefs } },
    );
    return { success: true, message: 'Preferences updated', data: prefs };
  }

  /** Notify all admin users (e.g. new verification request from lawyer) */
  async notifyAdmins(title: string, message: string, actionUrl?: string) {
    const admins = await this.userModel.find({ role: UserRole.ADMIN, isActive: true }).select('_id').lean().exec();
    const results = await Promise.allSettled(
      admins.map((admin) =>
        this.createNotification(
          (admin._id as Types.ObjectId).toString(),
          NotificationType.ADMIN_VERIFICATION_REQUEST,
          title,
          message,
          {},
          actionUrl ?? '/admin/verifications',
        ),
      ),
    );
    return { notified: results.filter((r) => r.status === 'fulfilled').length };
  }

  /** Notify admins when citizen has not paid (unpaid consultation - until case complete) */
  async notifyAdminsPendingPayment(title: string, message: string, data?: Record<string, any>, actionUrl?: string) {
    const admins = await this.userModel.find({ role: UserRole.ADMIN, isActive: true }).select('_id').lean().exec();
    const results = await Promise.allSettled(
      admins.map((admin) =>
        this.createNotification(
          (admin._id as Types.ObjectId).toString(),
          NotificationType.ADMIN_PENDING_PAYMENT,
          title,
          message,
          data ?? {},
          actionUrl ?? '/admin/payments',
          { sendEmail: false },
        ),
      ),
    );
    return { notified: results.filter((r) => r.status === 'fulfilled').length };
  }

  async notifyAdminsPaymentEvent(
    title: string,
    message: string,
    data?: Record<string, any>,
    actionUrl?: string,
  ) {
    const admins = await this.userModel.find({ role: UserRole.ADMIN, isActive: true }).select('_id').lean().exec();
    const results = await Promise.allSettled(
      admins.map((admin) =>
        this.createNotification(
          (admin._id as Types.ObjectId).toString(),
          NotificationType.ADMIN_PENDING_PAYMENT,
          title,
          message,
          data ?? {},
          actionUrl ?? '/admin/payments',
          { sendEmail: false, sendSms: false },
        ),
      ),
    );
    return { notified: results.filter((r) => r.status === 'fulfilled').length };
  }

  async notifyAdminsChatViolation(
    title: string,
    message: string,
    data?: Record<string, any>,
    actionUrl?: string,
  ) {
    const admins = await this.userModel.find({ role: UserRole.ADMIN, isActive: true }).select('_id').lean().exec();
    const results = await Promise.allSettled(
      admins.map((admin) =>
        this.createNotification(
          (admin._id as Types.ObjectId).toString(),
          NotificationType.SYSTEM_ANNOUNCEMENT,
          title,
          message,
          data ?? {},
          actionUrl ?? '/admin/chat-violations',
        ),
      ),
    );
    return { notified: results.filter((r) => r.status === 'fulfilled').length };
  }
}
