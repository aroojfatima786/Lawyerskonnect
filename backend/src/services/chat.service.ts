import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Message, MessageDocument } from '../schemas/message.schema';
import { Conversation, ConversationDocument } from '../schemas/conversation.schema';
import { User, UserDocument } from '../schemas/user.schema';
import { Appointment, AppointmentDocument, AppointmentStatus } from '../schemas/appointment.schema';
import { Payment, PaymentDocument, PaymentStatus } from '../schemas/payment.schema';
import {
  ChatViolation,
  ChatViolationDocument,
  ChatViolationType,
} from '../schemas/chat-violation.schema';
import { NotificationService } from './notification.service';
import { StorageService } from './storage.service';
import { UserRole } from '../schemas/user.schema';

@Injectable()
export class ChatService {
  private static readonly PKT_OFFSET_MINUTES = 5 * 60;
  private readonly sendMessageWindow = new Map<string, { count: number; resetAt: number }>();

  private extractHourMinute(rawTime: string): { hour: number; minute: number } {
    const raw = String(rawTime || '').trim();
    if (!raw) return { hour: 0, minute: 0 };

    const isoMatch = raw.match(/T(\d{2}):(\d{2})/);
    if (isoMatch) {
      return { hour: parseInt(isoMatch[1], 10) || 0, minute: parseInt(isoMatch[2], 10) || 0 };
    }

    const amPmMatch = raw.match(/(\d{1,2})[:.](\d{2})\s*([AaPp][Mm])/);
    if (amPmMatch) {
      const h = parseInt(amPmMatch[1], 10) || 0;
      const m = parseInt(amPmMatch[2], 10) || 0;
      const ampm = amPmMatch[3].toUpperCase();
      const hour = ampm === 'PM' ? (h % 12) + 12 : h % 12;
      return { hour, minute: m };
    }

    const normalized = raw.replace('.', ':');
    const [hhRaw, mmRaw] = normalized.split(':');
    return {
      hour: parseInt(hhRaw || '0', 10) || 0,
      minute: parseInt(mmRaw || '0', 10) || 0,
    };
  }

  private normalizeSlotTime(rawTime: string): string {
    const { hour, minute } = this.extractHourMinute(rawTime);
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  }
  private static readonly APPOINTMENT_NOT_CONFIRMED_MESSAGE =
    'Consultation chat is available after appointment confirmation.';
  private static readonly CONSULTATION_NOT_STARTED_MESSAGE =
    'Consultation chat will be available at the scheduled appointment time.';
  private static readonly APPOINTMENT_ENDED_OR_CANCELLED_MESSAGE =
    'Consultation chat is not available because the appointment has ended or was cancelled.';

  private static readonly TERMINAL_APPOINTMENT_STATUSES = new Set<AppointmentStatus>([
    AppointmentStatus.CANCELLED,
    AppointmentStatus.COMPLETED,
    AppointmentStatus.NO_SHOW,
  ]);

  private enforceMessageRateLimit(senderId: string) {
    const now = Date.now();
    const bucket = this.sendMessageWindow.get(senderId);
    if (!bucket || now > bucket.resetAt) {
      this.sendMessageWindow.set(senderId, { count: 1, resetAt: now + 60_000 });
      return;
    }
    if (bucket.count >= 30) {
      throw new HttpException('Too many messages. Slow down.', HttpStatus.TOO_MANY_REQUESTS);
    }
    bucket.count += 1;
    this.sendMessageWindow.set(senderId, bucket);
  }

  constructor(
    @InjectModel(Message.name) private messageModel: Model<MessageDocument>,
    @InjectModel(Conversation.name) private conversationModel: Model<ConversationDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Appointment.name) private appointmentModel: Model<AppointmentDocument>,
    @InjectModel(Payment.name) private paymentModel: Model<PaymentDocument>,
    @InjectModel(ChatViolation.name) private chatViolationModel: Model<ChatViolationDocument>,
    private notificationService: NotificationService,
    private storageService: StorageService,
  ) {}

  // Generate conversation ID from two user IDs
  private generateConversationId(userId1: string, userId2: string): string {
    const sorted = [userId1, userId2].sort();
    return `${sorted[0]}_${sorted[1]}`;
  }

  // Get or create conversation between two users
  async getOrCreateConversation(userId1: string, userId2: string) {
    const conversationId = this.generateConversationId(userId1, userId2);

    let conversation = await this.conversationModel.findOne({ conversationId });

    if (!conversation) {
      // Verify both users exist
      const [user1, user2] = await Promise.all([
        this.userModel.findById(userId1),
        this.userModel.findById(userId2),
      ]);

      if (!user1 || !user2) {
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }

      conversation = new this.conversationModel({
        conversationId,
        participants: [new Types.ObjectId(userId1), new Types.ObjectId(userId2)],
        unreadCount: { [userId1]: 0, [userId2]: 0 },
      });

      await conversation.save();
    }

    return conversation;
  }

  /** UC-05: Max attachment size 10MB per file */
  private static readonly MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024;

  private static readonly ALLOWED_ATTACHMENT_EXTENSIONS = new Set([
    '.pdf',
    '.doc',
    '.docx',
    '.png',
    '.jpg',
    '.jpeg',
  ]);

  private static readonly ALLOWED_ATTACHMENT_MIMES = new Set([
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/png',
    'image/jpeg',
    'image/jpg',
  ]);

  private static readonly BLOCKED_ATTACHMENT_EXTENSIONS = new Set([
    '.exe',
    '.js',
    '.mjs',
    '.html',
    '.htm',
    '.svg',
    '.bat',
    '.cmd',
    '.sh',
    '.php',
    '.zip',
    '.rar',
  ]);

  private assertAllowedChatFile(file: { originalname?: string; mimetype?: string; size?: number }) {
    const name = String(file.originalname || '').toLowerCase();
    const ext = name.includes('.') ? name.slice(name.lastIndexOf('.')) : '';
    const mime = String(file.mimetype || '').toLowerCase();

    if (ext && ChatService.BLOCKED_ATTACHMENT_EXTENSIONS.has(ext)) {
      throw new HttpException(
        'This file type is not allowed. Use PDF, DOC, DOCX, PNG, JPG, or JPEG.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const extOk = ext ? ChatService.ALLOWED_ATTACHMENT_EXTENSIONS.has(ext) : false;
    const mimeOk = mime ? ChatService.ALLOWED_ATTACHMENT_MIMES.has(mime) : false;
    if (!extOk && !mimeOk) {
      throw new HttpException(
        'Unsupported file type. Allowed: PDF, DOC, DOCX, PNG, JPG, JPEG.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const size = typeof file.size === 'number' ? file.size : 0;
    if (!size || size > ChatService.MAX_ATTACHMENT_SIZE_BYTES) {
      throw new HttpException('File size exceeds 10MB', HttpStatus.BAD_REQUEST);
    }
  }

  private normalizeAttachmentPayload(att: any) {
    if (!att?.url || typeof att.url !== 'string') {
      throw new HttpException('Invalid attachment metadata', HttpStatus.BAD_REQUEST);
    }
    const payload = {
      filename: String(att.filename || att.originalName || 'file'),
      originalName: String(att.originalName || att.filename || 'file'),
      mimeType: String(att.mimeType || 'application/octet-stream'),
      size: typeof att.size === 'number' ? att.size : parseInt(String(att.size || '0'), 10),
      url: String(att.url),
    };
    this.assertAllowedChatFile({
      originalname: payload.originalName,
      mimetype: payload.mimeType,
      size: payload.size,
    });
    return payload;
  }

  async uploadChatAttachment(senderId: string, receiverId: string, file: Express.Multer.File) {
    if (!receiverId || !Types.ObjectId.isValid(receiverId)) {
      throw new HttpException('Invalid receiver', HttpStatus.BAD_REQUEST);
    }
    if (senderId === receiverId) {
      throw new HttpException('Cannot send attachment to yourself', HttpStatus.BAD_REQUEST);
    }

    const receiver = await this.userModel.findById(receiverId).select('_id role');
    if (!receiver) {
      throw new HttpException('Receiver not found', HttpStatus.NOT_FOUND);
    }

    await this.resolvePaidAppointment(senderId, receiverId);

    if (!file?.buffer?.length) {
      throw new HttpException('No file uploaded', HttpStatus.BAD_REQUEST);
    }

    this.assertAllowedChatFile(file);

    const isImage = /\.(png|jpe?g)$/i.test(file.originalname || '') || /^image\//i.test(file.mimetype || '');
    const uploaded = await this.storageService.uploadDocument(file, {
      subFolder: 'chat',
      resourceType: isImage ? 'image' : 'raw',
    });

    const attachment = {
      filename: uploaded.filename,
      originalName: file.originalname || uploaded.filename,
      mimeType: file.mimetype || 'application/octet-stream',
      size: file.size,
      url: uploaded.secureUrl || uploaded.url,
    };

    return { success: true, data: attachment };
  }
  private static readonly PAYMENT_REQUIRED_MESSAGE =
    'Payment required before consultation chat can start.';
  private static readonly CONTACT_SHARING_MESSAGE =
    'Sharing personal contact information is not allowed. Please continue communication inside LawyersKonnect.';

  private getConversationIdForUsers(userId1: string, userId2: string): string {
    return this.generateConversationId(userId1, userId2);
  }

  private throwPaymentRequired(): never {
    throw new HttpException(
      {
        code: 'PAYMENT_REQUIRED',
        message: ChatService.PAYMENT_REQUIRED_MESSAGE,
      },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }

  private buildAppointmentDateTime(appointmentDate: Date, time: string): Date {
    const parsed = this.extractHourMinute(time);
    const h = Number.isFinite(parsed.hour) ? parsed.hour : 0;
    const m = Number.isFinite(parsed.minute) ? parsed.minute : 0;
    // appointmentDate is stored as a date-only value, while startTime is a local PK slot.
    // Convert PK local appointment datetime to UTC instant for reliable server-side gating.
    const y = appointmentDate.getUTCFullYear();
    const mon = appointmentDate.getUTCMonth();
    const d = appointmentDate.getUTCDate();
    const utcMillis =
      Date.UTC(y, mon, d, h, m, 0, 0) - ChatService.PKT_OFFSET_MINUTES * 60 * 1000;
    return new Date(utcMillis);
  }

  private buildAppointmentEndDateTime(appointment: AppointmentDocument): Date {
    const hasExplicitEndTime = Boolean(String(appointment?.endTime || '').trim());
    if (hasExplicitEndTime) {
      return this.buildAppointmentDateTime(appointment.appointmentDate, appointment.endTime);
    }

    const start = this.buildAppointmentDateTime(appointment.appointmentDate, appointment.startTime);
    const durationMinutes =
      typeof appointment.duration === 'number' && appointment.duration > 0 ? appointment.duration : 30;
    return new Date(start.getTime() + durationMinutes * 60 * 1000);
  }

  private throwAppointmentNotConfirmed(): never {
    throw new HttpException(
      {
        code: 'APPOINTMENT_NOT_CONFIRMED',
        message: ChatService.APPOINTMENT_NOT_CONFIRMED_MESSAGE,
      },
      HttpStatus.FORBIDDEN,
    );
  }

  private throwConsultationNotStarted(): never {
    throw new HttpException(
      {
        code: 'CONSULTATION_NOT_STARTED',
        message: ChatService.CONSULTATION_NOT_STARTED_MESSAGE,
      },
      HttpStatus.FORBIDDEN,
    );
  }

  private throwAppointmentEndedOrCancelled(): never {
    throw new HttpException(
      {
        code: 'APPOINTMENT_ENDED_OR_CANCELLED',
        message: ChatService.APPOINTMENT_ENDED_OR_CANCELLED_MESSAGE,
      },
      HttpStatus.FORBIDDEN,
    );
  }

  private isContactSharing(content: string): { blocked: boolean; type?: string } {
    const text = content.toLowerCase();
    const compact = content.replace(/[\s\-().]/g, '');

    const emailRegex = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
    if (emailRegex.test(content)) return { blocked: true, type: 'email' };

    const pkPhoneRegex = /(?:\+92|0)?3\d{2}[\s\-]?\d{7,8}\b/;
    const compactPkPhoneRegex = /(?:\+92|0)?3\d{9,10}\b/;
    if (pkPhoneRegex.test(content) || compactPkPhoneRegex.test(compact)) {
      return { blocked: true, type: 'phone' };
    }

    const internationalPhoneRegex = /\+\d{1,3}[\s\-]?\(?\d{1,4}\)?[\s\-]?\d{3,4}[\s\-]?\d{3,6}/;
    if (internationalPhoneRegex.test(content)) return { blocked: true, type: 'phone' };

    // Block social links and common social handle-sharing patterns
    const socialLinkRegex =
      /(https?:\/\/)?(www\.)?(wa\.me|whatsapp\.com|instagram\.com|insta\.com|facebook\.com|fb\.com|m\.me|messenger\.com|t\.me|telegram\.me|telegram\.org|snapchat\.com|snap\.com|tiktok\.com|x\.com|twitter\.com|linkedin\.com)\/[^\s]+/i;
    if (socialLinkRegex.test(text)) return { blocked: true, type: 'social_link' };

    const socialKeywordsRegex =
      /\b(whatsapp|wa\.me|instagram|insta|facebook|fb|messenger|telegram|tiktok|snapchat|twitter|x\.com|linkedin|my id|my handle|follow me|dm me|inbox me|add me)\b/i;
    if (socialKeywordsRegex.test(text)) {
      // If user is sharing keyword + probable handle/username, block.
      const handleLikeRegex = /(^|\s)@?[a-z0-9._-]{3,}($|\s)/i;
      if (handleLikeRegex.test(text)) return { blocked: true, type: 'social_handle' };
    }

    if (
      /\b(whatsapp|wa\.me|call me|text me|contact me|my number|phone number|reach me)\b/i.test(
        text,
      )
    ) {
      return { blocked: true, type: 'contact_phrase' };
    }

    return { blocked: false };
  }

  private async resolveLatestAppointmentBetweenUsers(userId1: string, userId2: string) {
    const [uid1, uid2] = [new Types.ObjectId(userId1), new Types.ObjectId(userId2)];
    return this.appointmentModel
      .findOne({
        $or: [
          { citizenId: uid1, lawyerId: uid2 },
          { citizenId: uid2, lawyerId: uid1 },
        ],
      })
      .sort({ appointmentDate: -1, startTime: -1 })
      .exec();
  }

  private async resolvePaidAppointment(userId1: string, userId2: string) {
    const appointment = await this.resolveLatestAppointmentBetweenUsers(userId1, userId2);
    if (!appointment) {
      this.throwPaymentRequired();
    }

    if (appointment.status !== AppointmentStatus.CONFIRMED) {
      if (ChatService.TERMINAL_APPOINTMENT_STATUSES.has(appointment.status as AppointmentStatus)) {
        this.throwAppointmentEndedOrCancelled();
      }
      this.throwAppointmentNotConfirmed();
    }

    const start = this.buildAppointmentDateTime(appointment.appointmentDate, appointment.startTime);
    const end = this.buildAppointmentEndDateTime(appointment);
    if (new Date() < start) {
      this.throwConsultationNotStarted();
    }
    if (new Date() >= end) {
      this.throwAppointmentEndedOrCancelled();
    }

    const completedPayment = appointment.isPaid
      ? true
      : !!(await this.paymentModel.exists({
          appointmentId: appointment._id,
          status: PaymentStatus.COMPLETED,
        }));
    if (!completedPayment) {
      this.throwPaymentRequired();
    }

    return appointment;
  }

  private async buildAvailabilityMeta(
    currentUserId: string,
    otherUserId: string,
  ): Promise<{
    appointmentId?: string;
    appointmentStatus?: string;
    appointmentDate?: string;
    appointmentStartTime?: string;
    isPaid: boolean;
    canSendMessage: boolean;
    blockedReason?:
      | 'PAYMENT_REQUIRED'
      | 'CONSULTATION_NOT_STARTED'
      | 'APPOINTMENT_NOT_CONFIRMED'
      | 'APPOINTMENT_ENDED_OR_CANCELLED';
  }> {
    const appointment = await this.resolveLatestAppointmentBetweenUsers(currentUserId, otherUserId);
    if (!appointment) {
      return {
        isPaid: false,
        canSendMessage: false,
        blockedReason: 'APPOINTMENT_NOT_CONFIRMED',
      };
    }

    const start = this.buildAppointmentDateTime(appointment.appointmentDate, appointment.startTime);
    const end = this.buildAppointmentEndDateTime(appointment);
    const status = appointment.status as AppointmentStatus;
    const isPaid = appointment.isPaid
      ? true
      : !!(await this.paymentModel.exists({
          appointmentId: appointment._id,
          status: PaymentStatus.COMPLETED,
        }));

    let canSendMessage = false;
    let blockedReason:
      | 'PAYMENT_REQUIRED'
      | 'CONSULTATION_NOT_STARTED'
      | 'APPOINTMENT_NOT_CONFIRMED'
      | 'APPOINTMENT_ENDED_OR_CANCELLED'
      | undefined;

    if (ChatService.TERMINAL_APPOINTMENT_STATUSES.has(status)) {
      blockedReason = 'APPOINTMENT_ENDED_OR_CANCELLED';
    } else if (status !== AppointmentStatus.CONFIRMED) {
      blockedReason = 'APPOINTMENT_NOT_CONFIRMED';
    } else if (!isPaid) {
      blockedReason = 'PAYMENT_REQUIRED';
    } else if (new Date() < start) {
      blockedReason = 'CONSULTATION_NOT_STARTED';
    } else if (new Date() >= end) {
      blockedReason = 'APPOINTMENT_ENDED_OR_CANCELLED';
    } else {
      canSendMessage = true;
    }

    return {
      appointmentId: appointment._id.toString(),
      appointmentStatus: appointment.status,
      appointmentDate: appointment.appointmentDate.toISOString().slice(0, 10),
      // Normalize to HH:mm even if legacy rows contain ISO strings.
      appointmentStartTime: this.normalizeSlotTime(String(appointment.startTime || '')),
      isPaid,
      canSendMessage,
      blockedReason,
    };
  }

  private async logContactViolation(
    senderId: string,
    receiverId: string,
    appointmentId: Types.ObjectId | undefined,
    conversationId: string,
    rawMessage: string,
    violationType: string,
  ) {
    const excerpt = rawMessage.slice(0, 500);
    await this.chatViolationModel.create({
      senderId: new Types.ObjectId(senderId),
      receiverId: new Types.ObjectId(receiverId),
      appointmentId,
      conversationId,
      messageExcerpt: excerpt,
      violationType: ChatViolationType.CONTACT_SHARING,
    });

    await this.notificationService.notifyAdminsChatViolation(
      'Chat policy violation detected',
      `A user attempted to share ${violationType.replace('_', ' ')} in chat.`,
      {
        senderId,
        receiverId,
        appointmentId: appointmentId?.toString(),
        conversationId,
      },
      '/admin/chat-violations',
    );
  }

  // Send a message (only allowed between users with a confirmed/completed appointment)
  async sendMessage(
    senderId: string,
    receiverId: string,
    content?: string,
    attachments?: any[],
  ) {
    this.enforceMessageRateLimit(senderId);
    if (!content && (!attachments || attachments.length === 0)) {
      throw new HttpException('Message must have content or attachments', HttpStatus.BAD_REQUEST);
    }
    if (content && content.length > 2000) {
      throw new HttpException('Message is too long', HttpStatus.BAD_REQUEST);
    }

    let normalizedAttachments: Array<{
      filename: string;
      originalName: string;
      mimeType: string;
      size: number;
      url: string;
    }> = [];
    if (attachments?.length) {
      normalizedAttachments = attachments.map((att) => this.normalizeAttachmentPayload(att));
    }

    const appointment = await this.resolvePaidAppointment(senderId, receiverId);

    if (content?.trim()) {
      const check = this.isContactSharing(content);
      if (check.blocked) {
        await this.logContactViolation(
          senderId,
          receiverId,
          appointment?._id as Types.ObjectId | undefined,
          this.getConversationIdForUsers(senderId, receiverId),
          content,
          check.type || 'contact_detail',
        );
        throw new HttpException(
          {
            code: 'CONTACT_SHARING_NOT_ALLOWED',
            message: ChatService.CONTACT_SHARING_MESSAGE,
          },
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    // Get or create conversation
    const conversation = await this.getOrCreateConversation(senderId, receiverId);

    // Create message
    const message = new this.messageModel({
      senderId: new Types.ObjectId(senderId),
      receiverId: new Types.ObjectId(receiverId),
      conversationId: conversation.conversationId,
      content,
      attachments: normalizedAttachments,
    });

    await message.save();

    // Update conversation
    conversation.lastMessageId = message._id as Types.ObjectId;
    conversation.lastMessageContent = content?.substring(0, 100) || '[Attachment]';
    conversation.lastMessageAt = new Date();
    conversation.lastMessageSenderId = new Types.ObjectId(senderId);
    
    // Increment unread count for receiver
    const currentUnread = conversation.unreadCount[receiverId] || 0;
    conversation.unreadCount = {
      ...conversation.unreadCount,
      [receiverId]: currentUnread + 1,
    };

    await conversation.save();

    await this.conversationModel.updateOne(
      { conversationId: conversation.conversationId },
      {
        $pull: {
          hiddenBy: {
            $in: [new Types.ObjectId(senderId), new Types.ObjectId(receiverId)],
          },
        },
      },
    );

    // Populate sender info for response
    await message.populate('senderId', 'email citizenProfile.fullName lawyerProfile.fullName');

    const senderDoc = message.senderId as unknown as {
      citizenProfile?: { fullName?: string };
      lawyerProfile?: { fullName?: string };
    };
    const senderName =
      senderDoc?.citizenProfile?.fullName || senderDoc?.lawyerProfile?.fullName || 'Someone';
    // Non-blocking: message API should return quickly even if notification channels are slow.
    void this.notificationService
      .createMessageNotification(receiverId, senderName, conversation.conversationId)
      .catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[Chat] message notification failed:', msg);
      });

    return {
      success: true,
      data: message,
    };
  }

  // Get conversation messages
  async getConversationMessages(conversationId: string, userId: string, page = 1, limit = 50) {
    // Verify user is part of conversation
    const conversation = await this.conversationModel.findOne({
      conversationId,
      participants: userId,
    });

    if (!conversation) {
      throw new HttpException('Conversation not found', HttpStatus.NOT_FOUND);
    }

    const skip = (page - 1) * limit;

    const messages = await this.messageModel
      .find({ conversationId, isDeleted: false })
      .populate('senderId', 'email citizenProfile.fullName lawyerProfile.fullName lawyerProfile.profilePictureUrl')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .exec();

    const total = await this.messageModel.countDocuments({ conversationId, isDeleted: false });

    return {
      success: true,
      data: messages.reverse(), // Return in chronological order
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // Get user's conversations (only with users who have a confirmed/completed appointment)
  async getUserConversations(userId: string) {
    const uid = new Types.ObjectId(userId);
    const appointments = await this.appointmentModel
      .find({ $or: [{ citizenId: uid }, { lawyerId: uid }] })
      .populate('citizenId', 'email citizenProfile.fullName lawyerProfile.fullName lawyerProfile.profilePictureUrl role')
      .populate('lawyerId', 'email citizenProfile.fullName lawyerProfile.fullName lawyerProfile.profilePictureUrl role')
      .exec();

    const otherUserIds = new Set<string>();
    const otherUserMap = new Map<string, any>();
    for (const apt of appointments) {
      const other = (apt.citizenId as any)?._id?.toString() === userId ? apt.lawyerId : apt.citizenId;
      if (other && (other as any)._id) {
        const oid = (other as any)._id.toString();
        otherUserIds.add(oid);
        if (!otherUserMap.has(oid)) otherUserMap.set(oid, other);
      }
    }

    const result: any[] = [];
    for (const otherId of otherUserIds) {
      const availability = await this.buildAvailabilityMeta(userId, otherId);
      const conversationId = this.generateConversationId(userId, otherId);
      let conversation = await this.conversationModel.findOne({ conversationId });

      const shouldEnsure =
        !!availability.canSendMessage ||
        availability.blockedReason === 'PAYMENT_REQUIRED' ||
        availability.blockedReason === 'CONSULTATION_NOT_STARTED';

      if (!conversation && shouldEnsure) {
        conversation = await this.getOrCreateConversation(userId, otherId);
      }
      if (!conversation) continue;

      const hiddenBy = (conversation.hiddenBy || []).map((id) => id.toString());
      if (hiddenBy.includes(userId)) continue;

      const hasHistory = !!conversation.lastMessageAt;
      const listable =
        hasHistory ||
        !!availability.canSendMessage ||
        availability.blockedReason === 'PAYMENT_REQUIRED' ||
        availability.blockedReason === 'CONSULTATION_NOT_STARTED';
      if (!listable) continue;

      const otherParticipant = otherUserMap.get(otherId);
      result.push({
        conversationId: conversation.conversationId,
        otherParticipant,
        lastMessage: conversation.lastMessageContent,
        lastMessageAt: conversation.lastMessageAt,
        unreadCount: conversation.unreadCount?.[userId] || 0,
        appointmentId: conversation.appointmentId?.toString?.() ?? conversation.appointmentId,
        ...availability,
      });
    }
    result.sort((a, b) => (new Date(b.lastMessageAt || 0).getTime() - new Date(a.lastMessageAt || 0).getTime()));

    return { success: true, data: result };
  }

  // Mark messages as read
  async markMessagesAsRead(conversationId: string, userId: string) {
    // Update all unread messages in this conversation
    await this.messageModel.updateMany(
      { conversationId, receiverId: userId, isRead: false },
      { isRead: true, readAt: new Date() },
    );

    // Reset unread count in conversation
    await this.conversationModel.updateOne(
      { conversationId },
      { $set: { [`unreadCount.${userId}`]: 0 } },
    );

    return { success: true, message: 'Messages marked as read' };
  }

  // Get unread messages count
  async getUnreadCount(userId: string) {
    const count = await this.messageModel.countDocuments({
      receiverId: userId,
      isRead: false,
      isDeleted: false,
    });

    return { success: true, count };
  }

  async hideConversationForUser(conversationId: string, userId: string) {
    const conversation = await this.conversationModel.findOne({
      conversationId,
      participants: new Types.ObjectId(userId),
    });
    if (!conversation) {
      throw new HttpException('Conversation not found', HttpStatus.NOT_FOUND);
    }

    await this.conversationModel.updateOne(
      { conversationId },
      { $addToSet: { hiddenBy: new Types.ObjectId(userId) } },
    );

    return { success: true, message: 'Conversation removed from your list' };
  }

  // Delete a message (soft delete)
  async deleteMessage(messageId: string, userId: string) {
    const message = await this.messageModel.findOneAndUpdate(
      { _id: messageId, senderId: userId },
      { isDeleted: true },
      { new: true },
    );

    if (!message) {
      throw new HttpException('Message not found or unauthorized', HttpStatus.NOT_FOUND);
    }

    return { success: true, message: 'Message deleted' };
  }

  async editMessage(messageId: string, userId: string, content: string) {
    const trimmed = String(content || '').trim();
    if (!trimmed) {
      throw new HttpException('Message content is required', HttpStatus.BAD_REQUEST);
    }

    const message = await this.messageModel.findOneAndUpdate(
      { _id: messageId, senderId: userId, isDeleted: false },
      { content: trimmed },
      { new: true },
    );

    if (!message) {
      throw new HttpException('Message not found or unauthorized', HttpStatus.NOT_FOUND);
    }

    return { success: true, data: message };
  }

  // Get conversation between two users
  async getConversationByUsers(userId1: string, userId2: string) {
    const conversation = await this.getOrCreateConversation(userId1, userId2);
    await conversation.populate('participants', 'email citizenProfile.fullName lawyerProfile.fullName lawyerProfile.profilePictureUrl role');

    const populated = await this.conversationModel
      .findById(conversation._id)
      .populate('participants', 'email citizenProfile.fullName lawyerProfile.fullName lawyerProfile.profilePictureUrl role');

    const availability = await this.buildAvailabilityMeta(userId1, userId2);
    return { success: true, data: populated || conversation, exists: true, availability };
  }

  async ensureConversationForAppointment(citizenId: string, lawyerId: string, appointmentId: string) {
    const conversation = await this.getOrCreateConversation(citizenId, lawyerId);
    if (!conversation.appointmentId || conversation.appointmentId.toString() !== appointmentId) {
      conversation.appointmentId = new Types.ObjectId(appointmentId);
      await conversation.save();
    }
    return conversation;
  }
}
