import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument, UserRole, VerificationStatus } from '../schemas/user.schema';
import { Appointment, AppointmentDocument, AppointmentStatus } from '../schemas/appointment.schema';
import { NotificationType } from '../schemas/notification.schema';
import { Payment, PaymentDocument, PaymentStatus } from '../schemas/payment.schema';
import { Review, ReviewDocument } from '../schemas/review.schema';
import { Category, CategoryDocument, DEFAULT_CATEGORIES } from '../schemas/category.schema';
import {
  ChatViolation,
  ChatViolationDocument,
  ChatViolationType,
} from '../schemas/chat-violation.schema';
import { NotificationService } from './notification.service';
import { PaymentProviderFactory } from '../payments/payment-provider.factory';

@Injectable()
export class AdminService {
  private escapeRegex(input: string): string {
    return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Appointment.name) private appointmentModel: Model<AppointmentDocument>,
    @InjectModel(Payment.name) private paymentModel: Model<PaymentDocument>,
    @InjectModel(Review.name) private reviewModel: Model<ReviewDocument>,
    @InjectModel(Category.name) private categoryModel: Model<CategoryDocument>,
    @InjectModel(ChatViolation.name) private chatViolationModel: Model<ChatViolationDocument>,
    private notificationService: NotificationService,
  ) {}

  // ==================== Dashboard Analytics ====================

  async getDashboardStats() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);

    const [
      totalUsers,
      totalCitizens,
      totalLawyers,
      verifiedLawyers,
      pendingVerifications,
      totalAppointments,
      completedAppointments,
      todayAppointments,
      monthlyRevenue,
      lastMonthRevenue,
      totalReviews,
    ] = await Promise.all([
      this.userModel.countDocuments(),
      this.userModel.countDocuments({ role: UserRole.CITIZEN }),
      this.userModel.countDocuments({ role: UserRole.LAWYER }),
      this.userModel.countDocuments({ role: UserRole.LAWYER, 'lawyerProfile.verificationStatus': VerificationStatus.VERIFIED }),
      this.userModel.countDocuments({ role: UserRole.LAWYER, 'lawyerProfile.verificationStatus': VerificationStatus.PENDING }),
      this.appointmentModel.countDocuments(),
      this.appointmentModel.countDocuments({ status: AppointmentStatus.COMPLETED }),
      this.appointmentModel.countDocuments({ appointmentDate: { $gte: today } }),
      this.paymentModel.aggregate([
        { $match: { status: PaymentStatus.COMPLETED, createdAt: { $gte: thisMonth } } },
        { $group: { _id: null, total: { $sum: '$amount' }, platformFee: { $sum: '$platformFeeAmount' } } },
      ]),
      this.paymentModel.aggregate([
        { $match: { status: PaymentStatus.COMPLETED, createdAt: { $gte: lastMonth, $lt: thisMonth } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      this.reviewModel.countDocuments(),
    ]);

    const currentRevenue = monthlyRevenue[0]?.total || 0;
    const previousRevenue = lastMonthRevenue[0]?.total || 0;
    const revenueGrowth = previousRevenue > 0 
      ? Math.round(((currentRevenue - previousRevenue) / previousRevenue) * 100) 
      : 100;

    return {
      success: true,
      data: {
        users: {
          total: totalUsers,
          citizens: totalCitizens,
          lawyers: totalLawyers,
          verifiedLawyers,
          pendingVerifications,
        },
        appointments: {
          total: totalAppointments,
          completed: completedAppointments,
          today: todayAppointments,
        },
        revenue: {
          thisMonth: currentRevenue,
          platformEarnings: monthlyRevenue[0]?.platformFee || 0,
          growth: revenueGrowth,
        },
        reviews: totalReviews,
      },
    };
  }

  // Get chart data for analytics
  async getAnalyticsChartData(period: 'week' | 'month' | 'year' = 'month') {
    const now = new Date();
    let startDate: Date;
    let groupBy: any;

    switch (period) {
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        groupBy = { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } };
        break;
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1);
        groupBy = { $dateToString: { format: '%Y-%m', date: '$createdAt' } };
        break;
      default: // month
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        groupBy = { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } };
    }

    const [userRegistrations, appointmentBookings, revenueData] = await Promise.all([
      this.userModel.aggregate([
        { $match: { createdAt: { $gte: startDate } } },
        { $group: { _id: groupBy, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      this.appointmentModel.aggregate([
        { $match: { createdAt: { $gte: startDate } } },
        { $group: { _id: groupBy, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      this.paymentModel.aggregate([
        { $match: { status: PaymentStatus.COMPLETED, createdAt: { $gte: startDate } } },
        { $group: { _id: groupBy, revenue: { $sum: '$amount' } } },
        { $sort: { _id: 1 } },
      ]),
    ]);

    return {
      success: true,
      data: {
        userRegistrations,
        appointmentBookings,
        revenueData,
      },
    };
  }

  // ==================== User Management ====================

  async getAllUsers(filters: any, page = 1, limit = 20) {
    const query: any = {};

    if (filters.role) {
      query.role = filters.role;
    }
    if (filters.isActive !== undefined) {
      query.isActive = filters.isActive === 'true';
    }
    if (filters.search) {
      const safeSearch = this.escapeRegex(String(filters.search).trim().slice(0, 80));
      query.$or = [
        { email: { $regex: safeSearch, $options: 'i' } },
        { 'citizenProfile.fullName': { $regex: safeSearch, $options: 'i' } },
        { 'lawyerProfile.fullName': { $regex: safeSearch, $options: 'i' } },
      ];
    }

    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      this.userModel
        .find(query)
        .select('-password -verificationCode -loginOtpCode -passwordResetCode')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.userModel.countDocuments(query),
    ]);

    return {
      success: true,
      data: users,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getUserById(userId: string) {
    const user = await this.userModel
      .findById(userId)
      .select('-password -verificationCode -loginOtpCode -passwordResetCode');

    if (!user) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }

    return { success: true, data: user };
  }

  async updateUserStatus(userId: string, isActive: boolean) {
    const user = await this.userModel.findByIdAndUpdate(
      userId,
      { isActive },
      { new: true },
    ).select('-password');

    if (!user) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }

    return {
      success: true,
      message: `User ${isActive ? 'activated' : 'deactivated'} successfully`,
      data: user,
    };
  }

  async deleteUser(userId: string) {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }

    if (user.role === UserRole.ADMIN) {
      throw new HttpException('Cannot delete admin users', HttpStatus.FORBIDDEN);
    }

    await this.userModel.deleteOne({ _id: userId });

    return { success: true, message: 'User deleted successfully' };
  }

  // ==================== Lawyer Verification (legacy — use IdentityService for KYC queue) ====================

  async getPendingVerifications(page = 1, limit = 20) {
    const query = {
      role: UserRole.LAWYER,
      'lawyerProfile.verificationStatus': VerificationStatus.PENDING,
    };

    const skip = (page - 1) * limit;

    const [lawyers, total] = await Promise.all([
      this.userModel
        .find(query)
        .select('-password -verificationCode -loginOtpCode -passwordResetCode')
        .sort({ 'lawyerProfile.verificationSubmittedAt': 1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.userModel.countDocuments(query),
    ]);

    return {
      success: true,
      data: lawyers,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async verifyLawyer(lawyerId: string, approved: boolean, rejectionReason?: string) {
    const lawyer = await this.userModel.findOne({
      _id: lawyerId,
      role: UserRole.LAWYER,
    });

    if (!lawyer) {
      throw new HttpException('Lawyer not found', HttpStatus.NOT_FOUND);
    }

    if (!lawyer.lawyerProfile) {
      throw new HttpException('Lawyer profile not found', HttpStatus.BAD_REQUEST);
    }

    if (approved) {
      lawyer.lawyerProfile.verificationStatus = VerificationStatus.VERIFIED;
      lawyer.lawyerProfile.verifiedAt = new Date();
      lawyer.lawyerProfile.verificationRejectionReason = undefined;

      // Send approval notification
      await this.notificationService.createVerificationNotification(lawyerId, 'approved');
    } else {
      lawyer.lawyerProfile.verificationStatus = VerificationStatus.REJECTED;
      lawyer.lawyerProfile.verificationRejectionReason = rejectionReason;

      // Send rejection notification
      await this.notificationService.createVerificationNotification(lawyerId, 'rejected', rejectionReason);
    }

    await lawyer.save();

    return {
      success: true,
      message: `Lawyer ${approved ? 'approved' : 'rejected'} successfully`,
      data: lawyer,
    };
  }

  async broadcastAnnouncement(
    title: string,
    message: string,
    targetRole?: 'citizen' | 'lawyer' | 'admin' | 'all',
    actionUrl?: string,
  ) {
    const normalizedTarget = (targetRole || 'all').toLowerCase();
    if (!['citizen', 'lawyer', 'admin', 'all'].includes(normalizedTarget)) {
      throw new HttpException('Invalid targetRole', HttpStatus.BAD_REQUEST);
    }
    const query: any = { isActive: true };
    if (normalizedTarget !== 'all') {
      query.role = normalizedTarget;
    }
    const users = await this.userModel.find(query).select('_id').lean().exec();
    await Promise.all(
      users.map((user) =>
        this.notificationService.createNotification(
          (user._id as any).toString(),
          NotificationType.SYSTEM_ANNOUNCEMENT,
          title,
          message,
          { targetRole: normalizedTarget },
          actionUrl,
        ),
      ),
    );
    return {
      success: true,
      message: 'Announcement broadcast to active users',
      data: { targetRole: normalizedTarget, recipients: users.length },
    };
  }

  async getChatViolations(
    filters: {
      violationType?: ChatViolationType;
      senderId?: string;
      appointmentId?: string;
      startDate?: string;
      endDate?: string;
    },
    page = 1,
    limit = 20,
  ) {
    const query: any = {};

    if (filters.violationType) {
      query.violationType = filters.violationType;
    }
    if (filters.senderId && Types.ObjectId.isValid(filters.senderId)) {
      query.senderId = new Types.ObjectId(filters.senderId);
    }
    if (filters.appointmentId && Types.ObjectId.isValid(filters.appointmentId)) {
      query.appointmentId = new Types.ObjectId(filters.appointmentId);
    }
    if (filters.startDate || filters.endDate) {
      query.createdAt = {};
      if (filters.startDate) {
        query.createdAt.$gte = new Date(filters.startDate);
      }
      if (filters.endDate) {
        query.createdAt.$lte = new Date(filters.endDate);
      }
    }

    const skip = (page - 1) * limit;

    const [violations, total] = await Promise.all([
      this.chatViolationModel
        .find(query)
        .populate('senderId', 'email citizenProfile.fullName lawyerProfile.fullName role')
        .populate('receiverId', 'email citizenProfile.fullName lawyerProfile.fullName role')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.chatViolationModel.countDocuments(query),
    ]);

    return {
      success: true,
      data: violations,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ==================== Category Management ====================

  async getCategories() {
    const categories = await this.categoryModel.find().sort({ order: 1 }).lean();
    // Count verified lawyers per category (lawyer profile practiceAreas = category name)
    const withCounts = await Promise.all(
      (categories as any[]).map(async (cat) => {
        const count = await this.userModel.countDocuments({
          role: UserRole.LAWYER,
          'lawyerProfile.verificationStatus': VerificationStatus.VERIFIED,
          $or: [
            { 'lawyerProfile.practiceAreas': cat.name },
            { 'lawyerProfile.practiceAreas': cat.slug },
          ],
        });
        return { ...cat, lawyerCount: count };
      }),
    );
    return { success: true, data: withCounts };
  }

  async createCategory(name: string, description?: string, icon?: string) {
    const slug = name.toLowerCase().replace(/\s+/g, '-');

    const existing = await this.categoryModel.findOne({ slug });
    if (existing) {
      throw new HttpException('Category already exists', HttpStatus.CONFLICT);
    }

    const maxOrder = await this.categoryModel.findOne().sort({ order: -1 });
    const order = (maxOrder?.order || 0) + 1;

    const category = new this.categoryModel({
      name,
      slug,
      description,
      icon,
      order,
    });

    await category.save();

    return { success: true, message: 'Category created', data: category };
  }

  async updateCategory(categoryId: string, updates: any) {
    const category = await this.categoryModel.findByIdAndUpdate(
      categoryId,
      updates,
      { new: true },
    );

    if (!category) {
      throw new HttpException('Category not found', HttpStatus.NOT_FOUND);
    }

    return { success: true, message: 'Category updated', data: category };
  }

  async deleteCategory(categoryId: string) {
    await this.categoryModel.deleteOne({ _id: categoryId });
    return { success: true, message: 'Category deleted' };
  }

  async seedCategories() {
    const existing = await this.categoryModel.countDocuments();
    if (existing > 0) {
      return { success: true, message: 'Categories already seeded' };
    }

    const categories = DEFAULT_CATEGORIES.map((cat, index) => ({
      ...cat,
      order: index + 1,
      isActive: true,
      lawyerCount: 0,
    }));

    await this.categoryModel.insertMany(categories);

    return { success: true, message: 'Categories seeded successfully' };
  }

  // ==================== Review Management ====================

  async getAllReviews(filters: any, page = 1, limit = 20) {
    const query: any = {};

    if (filters.lawyerId) {
      query.lawyerId = filters.lawyerId;
    }
    if (filters.rating) {
      query.rating = parseInt(filters.rating);
    }
    if (filters.isVisible !== undefined) {
      query.isVisible = filters.isVisible === 'true';
    }

    const skip = (page - 1) * limit;

    const [reviews, total] = await Promise.all([
      this.reviewModel
        .find(query)
        .populate('citizenId', 'email citizenProfile.fullName')
        .populate('lawyerId', 'email lawyerProfile.fullName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.reviewModel.countDocuments(query),
    ]);

    return {
      success: true,
      data: reviews,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async deleteReview(reviewId: string) {
    const review = await this.reviewModel.findById(reviewId);
    if (!review) {
      throw new HttpException('Review not found', HttpStatus.NOT_FOUND);
    }

    await this.reviewModel.deleteOne({ _id: reviewId });

    // Update lawyer rating
    const stats = await this.reviewModel.aggregate([
      { $match: { lawyerId: review.lawyerId, isVisible: true } },
      { $group: { _id: null, avgRating: { $avg: '$rating' }, count: { $sum: 1 } } },
    ]);

    await this.userModel.updateOne(
      { _id: review.lawyerId },
      {
        $set: {
          'lawyerProfile.averageRating': stats[0]?.avgRating || 0,
          'lawyerProfile.totalReviews': stats[0]?.count || 0,
        },
      },
    );

    return { success: true, message: 'Review deleted' };
  }

  // ==================== Reports ====================

  async getReports(type: 'users' | 'appointments' | 'revenue', startDate: string, endDate: string) {
    const start = new Date(startDate);
    const end = new Date(endDate);

    switch (type) {
      case 'users':
        return this.getUsersReport(start, end);
      case 'appointments':
        return this.getAppointmentsReport(start, end);
      case 'revenue':
        return this.getRevenueReport(start, end);
      default:
        throw new HttpException('Invalid report type', HttpStatus.BAD_REQUEST);
    }
  }

  private async getUsersReport(start: Date, end: Date) {
    const data = await this.userModel.aggregate([
      { $match: { createdAt: { $gte: start, $lte: end } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          citizens: { $sum: { $cond: [{ $eq: ['$role', UserRole.CITIZEN] }, 1, 0] } },
          lawyers: { $sum: { $cond: [{ $eq: ['$role', UserRole.LAWYER] }, 1, 0] } },
          total: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    return { success: true, data };
  }

  private async getAppointmentsReport(start: Date, end: Date) {
    const data = await this.appointmentModel.aggregate([
      { $match: { createdAt: { $gte: start, $lte: end } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          pending: { $sum: { $cond: [{ $eq: ['$status', AppointmentStatus.PENDING] }, 1, 0] } },
          confirmed: { $sum: { $cond: [{ $eq: ['$status', AppointmentStatus.CONFIRMED] }, 1, 0] } },
          completed: { $sum: { $cond: [{ $eq: ['$status', AppointmentStatus.COMPLETED] }, 1, 0] } },
          cancelled: { $sum: { $cond: [{ $eq: ['$status', AppointmentStatus.CANCELLED] }, 1, 0] } },
          total: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    return { success: true, data };
  }

  private async getRevenueReport(start: Date, end: Date) {
    const data = await this.paymentModel.aggregate([
      { $match: { status: PaymentStatus.COMPLETED, createdAt: { $gte: start, $lte: end } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          revenue: { $sum: '$amount' },
          platformFee: { $sum: '$platformFeeAmount' },
          transactions: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    return { success: true, data };
  }

  /** UC-10: Export report as CSV string for download */
  async getReportsCsv(
    type: 'users' | 'appointments' | 'revenue',
    startDate: string,
    endDate: string,
  ): Promise<string> {
    const result = await this.getReports(type, startDate, endDate);
    const data = (result as any).data || [];
    if (!Array.isArray(data) || data.length === 0) {
      if (type === 'users') return 'Date,Citizens,Lawyers,Total\n';
      if (type === 'appointments') return 'Date,Pending,Confirmed,Completed,Cancelled,Total\n';
      if (type === 'revenue') return 'Date,Revenue,PlatformFee,Transactions\n';
    }
    const headers = Object.keys(data[0]).filter((k) => k !== '_id').concat(type === 'users' ? ['Date'] : []);
    if (type === 'users') {
      const headerRow = 'Date,Citizens,Lawyers,Total';
      const rows = data.map((r: any) => `${r._id || ''},${r.citizens ?? 0},${r.lawyers ?? 0},${r.total ?? 0}`);
      return [headerRow, ...rows].join('\n');
    }
    if (type === 'appointments') {
      const headerRow = 'Date,Pending,Confirmed,Completed,Cancelled,Total';
      const rows = data.map(
        (r: any) =>
          `${r._id || ''},${r.pending ?? 0},${r.confirmed ?? 0},${r.completed ?? 0},${r.cancelled ?? 0},${r.total ?? 0}`,
      );
      return [headerRow, ...rows].join('\n');
    }
    if (type === 'revenue') {
      const headerRow = 'Date,Revenue,PlatformFee,Transactions';
      const rows = data.map(
        (r: any) => `${r._id || ''},${r.revenue ?? 0},${r.platformFee ?? 0},${r.transactions ?? 0}`,
      );
      return [headerRow, ...rows].join('\n');
    }
    return '';
  }

  /** Non-secret demo/ops overview for admins (logging reference; no PHI). */
  getIntegrationsOverview() {
    const emailProvider = (process.env.EMAIL_PROVIDER || 'mock').toLowerCase().trim();
    const smsProvider = (process.env.SMS_PROVIDER || 'none').toLowerCase().trim();
    let paymentProvider = 'manual';
    try {
      paymentProvider = PaymentProviderFactory.resolveProviderNameFromEnv();
    } catch {
      paymentProvider = 'invalid_env';
    }

    const jazzcashConfigured = [
      process.env.JAZZCASH_MERCHANT_ID,
      process.env.JAZZCASH_PASSWORD,
      process.env.JAZZCASH_INTEGRITY_SALT,
      process.env.JAZZCASH_RETURN_URL,
      process.env.JAZZCASH_WEBHOOK_URL,
    ].every((v) => String(v || '').trim().length > 0);

    const easypaisaConfigured = [
      process.env.EASYPAISA_STORE_ID,
      process.env.EASYPAISA_HASH_KEY,
      process.env.EASYPAISA_ACCOUNT_NUM,
      process.env.EASYPAISA_RETURN_URL,
      process.env.EASYPAISA_WEBHOOK_URL,
    ].every((v) => String(v || '').trim().length > 0);

    const twilioReady =
      smsProvider === 'twilio' &&
      String(process.env.SMS_TWILIO_ACCOUNT_SID || '').trim() &&
      String(process.env.SMS_TWILIO_AUTH_TOKEN || '').trim() &&
      String(process.env.SMS_FROM_NUMBER || '').trim();

    return {
      success: true,
      data: {
        emailProvider,
        emailIsMockOrDev: emailProvider === 'mock',
        smsProvider,
        smsInactive: smsProvider === 'none',
        smsIsMock: smsProvider === 'mock',
        twilioReady,
        paymentProvider,
        jazzcashConfigured,
        easypaisaConfigured,
        /** Card PSP session is not implemented in app code; see CardPaymentProvider */
        liveCardGatewayImplemented: false,
        notes: [
          emailProvider === 'mock'
            ? 'Emails are logged to the server console only (demo). Set EMAIL_PROVIDER=gmail or ses + credentials for outbound mail.'
            : null,
          smsProvider === 'none'
            ? 'SMS is off (SMS_PROVIDER=none). Use mock (console) or twilio with credentials.'
            : null,
        ].filter(Boolean),
      },
    };
  }
}
