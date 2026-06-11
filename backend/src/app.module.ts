import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { MulterModule } from '@nestjs/platform-express';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';

// Controllers
import { AppController } from './app.controller';
import { AuthController } from './controllers/auth.controller';
import { LawyerController } from './controllers/lawyer.controller';
import { AppointmentsController } from './controllers/appointments.controller';
import { ReviewController } from './controllers/review.controller';
import { PaymentController } from './controllers/payment.controller';
import { StripePaymentController } from './controllers/stripe-payment.controller';
import { LawyerSubscriptionController } from './controllers/lawyer-subscription.controller';
import { LawyerRegistrationController } from './controllers/lawyer-registration.controller';
import { AdminSubscriptionController } from './controllers/admin-subscription.controller';
import { ChatController } from './controllers/chat.controller';
import { NotificationController } from './controllers/notification.controller';
import { AdminController } from './controllers/admin.controller';
import { ComplaintsController } from './controllers/complaints.controller';
import { IdentityController } from './controllers/identity.controller';
import { PublicController } from './controllers/public.controller';
import { AdminLegalKnowledgeController } from './controllers/admin-legal-knowledge.controller';

// Services
import { AppService } from './app.service';
import { ComplaintService } from './services/complaint.service';
import { AuthService } from './services/auth.service';
import { EmailService } from './services/email.service';
import { LawyerService } from './services/lawyer.service';
import { AppointmentsService } from './services/appointments.service';
import { ReviewService } from './services/review.service';
import { PaymentService } from './services/payment.service';
import { StripePaymentService } from './services/stripe-payment.service';
import { LawyerSubscriptionService } from './services/lawyer-subscription.service';
import { LawyerRegistrationService } from './services/lawyer-registration.service';
import { LawyerPlanLimitsService } from './services/lawyer-plan-limits.service';
import { SubscriptionExpiryService } from './services/subscription-expiry.service';
import { ChatService } from './services/chat.service';
import { NotificationService } from './services/notification.service';
import { SmsService } from './services/sms.service';
import { AppointmentReminderService } from './services/appointment-reminder.service';
import { AppointmentConsultationClosureService } from './services/appointment-consultation-closure.service';
import { AdminService } from './services/admin.service';
import { IdentityService } from './services/identity.service';
import { KycVerificationService } from './services/kyc-verification.service';
import { PublicService } from './services/public.service';
import { AiLegalService } from './services/ai-legal.service';
import { LegalRagService } from './services/legal-rag.service';
import { StorageService } from './services/storage.service';
import { LegalKnowledgeService } from './services/legal-knowledge.service';
import { buildMongooseOptions } from './config/mongodb';
import { CitizenKycGuard } from './auth/citizen-kyc.guard';

// Gateways
import { ChatGateway } from './gateways/chat.gateway';

// Schemas
import { User, UserSchema } from './schemas/user.schema';
import { Appointment, AppointmentSchema } from './schemas/appointment.schema';
import { Review, ReviewSchema } from './schemas/review.schema';
import { Message, MessageSchema } from './schemas/message.schema';
import { Conversation, ConversationSchema } from './schemas/conversation.schema';
import { Payment, PaymentSchema } from './schemas/payment.schema';
import { LawyerSubscription, LawyerSubscriptionSchema } from './schemas/lawyer-subscription.schema';
import { PlatformWallet, PlatformWalletSchema } from './schemas/platform-wallet.schema';
import { Payout, PayoutSchema } from './schemas/payout.schema';
import { Notification, NotificationSchema } from './schemas/notification.schema';
import { Category, CategorySchema } from './schemas/category.schema';
import { Complaint, ComplaintSchema } from './schemas/complaint.schema';
import { IdentityDocument, IdentityDocumentSchema } from './schemas/identity.schema';
import { ContactInquiry, ContactInquirySchema } from './schemas/contact-inquiry.schema';
import { ChatViolation, ChatViolationSchema } from './schemas/chat-violation.schema';
import { LegalKnowledge, LegalKnowledgeSchema } from './schemas/legal-knowledge.schema';
import { LegalChatHistory, LegalChatHistorySchema } from './schemas/legal-chat-history.schema';

const isProd = process.env.NODE_ENV === 'production';

@Module({
  imports: [
    // EventEmitterModule for handling events
    EventEmitterModule.forRoot({
      wildcard: true,
      delimiter: '.',
      ignoreErrors: false,
      global: true,
    }),

    // ConfigModule for loading environment variables
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: isProd ? ['.env.production', '.env'] : ['.env', '.env.production'],
    }),

    // MongooseModule for MongoDB connection
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        const mongoUri = configService.get<string>('MONGODB_URI');
        if (!mongoUri) throw new Error('MONGODB_URI environment variable is not defined');

        return buildMongooseOptions(mongoUri, isProd);
      },
      inject: [ConfigService],
    }),

    MulterModule.register({
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB (KYC and uploads; route-specific limits may still apply)
    }),
    ScheduleModule.forRoot(),
    // Register all schemas
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Appointment.name, schema: AppointmentSchema },
      { name: Review.name, schema: ReviewSchema },
      { name: Message.name, schema: MessageSchema },
      { name: Conversation.name, schema: ConversationSchema },
      { name: Payment.name, schema: PaymentSchema },
      { name: LawyerSubscription.name, schema: LawyerSubscriptionSchema },
      { name: PlatformWallet.name, schema: PlatformWalletSchema },
      { name: Payout.name, schema: PayoutSchema },
      { name: Notification.name, schema: NotificationSchema },
      { name: Category.name, schema: CategorySchema },
      { name: Complaint.name, schema: ComplaintSchema },
      { name: IdentityDocument.name, schema: IdentityDocumentSchema },
      { name: ContactInquiry.name, schema: ContactInquirySchema },
      { name: ChatViolation.name, schema: ChatViolationSchema },
      { name: LegalKnowledge.name, schema: LegalKnowledgeSchema },
      { name: LegalChatHistory.name, schema: LegalChatHistorySchema },
    ]),
  ],
  controllers: [
    AppController,
    AuthController,
    LawyerController,
    AppointmentsController,
    ReviewController,
    PaymentController,
    StripePaymentController,
    LawyerSubscriptionController,
    LawyerRegistrationController,
    AdminSubscriptionController,
    ChatController,
    NotificationController,
    AdminController,
    ComplaintsController,
    IdentityController,
    PublicController,
    AdminLegalKnowledgeController,
  ],
  providers: [
    AppService,
    AuthService,
    EmailService,
    SmsService,
    LawyerService,
    AppointmentsService,
    ReviewService,
    PaymentService,
    StripePaymentService,
    LawyerSubscriptionService,
    LawyerRegistrationService,
    LawyerPlanLimitsService,
    SubscriptionExpiryService,
    ChatService,
    NotificationService,
    AppointmentReminderService,
    AppointmentConsultationClosureService,
    AdminService,
    ComplaintService,
    IdentityService,
    KycVerificationService,
    PublicService,
    AiLegalService,
    LegalRagService,
    LegalKnowledgeService,
    StorageService,
    CitizenKycGuard,
    ChatGateway,
  ],
})
export class AppModule {}
