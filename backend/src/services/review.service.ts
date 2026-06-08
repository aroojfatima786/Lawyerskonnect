import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Review, ReviewDocument } from '../schemas/review.schema';
import { User, UserDocument, UserRole } from '../schemas/user.schema';
import { Appointment, AppointmentDocument, AppointmentStatus } from '../schemas/appointment.schema';
import { NotificationService } from './notification.service';

@Injectable()
export class ReviewService {
  private static readonly REVIEW_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;
  constructor(
    @InjectModel(Review.name) private reviewModel: Model<ReviewDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Appointment.name) private appointmentModel: Model<AppointmentDocument>,
    private notificationService: NotificationService,
  ) {}

  // Create a review
  async createReview(
    citizenId: string,
    lawyerId: string,
    rating: number,
    comment?: string,
    appointmentId?: string,
  ) {
    // Validate rating
    if (rating < 1 || rating > 5) {
      throw new HttpException('Rating must be between 1 and 5', HttpStatus.BAD_REQUEST);
    }

    // Check if citizen exists
    const citizen = await this.userModel.findById(citizenId);
    if (!citizen || citizen.role !== UserRole.CITIZEN) {
      throw new HttpException('Citizen not found', HttpStatus.NOT_FOUND);
    }

    // Check if lawyer exists
    const lawyer = await this.userModel.findById(lawyerId);
    if (!lawyer || lawyer.role !== UserRole.LAWYER) {
      throw new HttpException('Lawyer not found', HttpStatus.NOT_FOUND);
    }

    let resolvedLawyerId = lawyerId;

    // If appointmentId provided, validate it
    if (appointmentId) {
      if (!Types.ObjectId.isValid(appointmentId)) {
        throw new HttpException('Invalid appointment for review', HttpStatus.BAD_REQUEST);
      }

      const appointment = await this.appointmentModel.findById(appointmentId).exec();
      if (!appointment) {
        throw new HttpException('Appointment not found for review', HttpStatus.NOT_FOUND);
      }
      if (appointment.citizenId.toString() !== citizenId) {
        throw new HttpException('You can only review your own consultation', HttpStatus.FORBIDDEN);
      }
      if (appointment.status !== AppointmentStatus.COMPLETED) {
        throw new HttpException(
          'You can only review a lawyer after completing a consultation',
          HttpStatus.BAD_REQUEST,
        );
      }

      // Use appointment-linked lawyer as source of truth to avoid frontend id-shape mismatch.
      resolvedLawyerId = appointment.lawyerId.toString();

      // Check if review already exists for this appointment
      const existingReview = await this.reviewModel.findOne({ appointmentId });
      if (existingReview) {
        throw new HttpException('You have already reviewed this consultation', HttpStatus.CONFLICT);
      }

      // Mark appointment as reviewed
      appointment.hasReview = true;
      await appointment.save();
    }

    // Check for existing review without appointment
    if (!appointmentId) {
      // Check if citizen has any completed appointment with this lawyer
      const hasCompletedAppointment = await this.appointmentModel.findOne({
        citizenId,
        lawyerId,
        status: AppointmentStatus.COMPLETED,
      });

      if (!hasCompletedAppointment) {
        throw new HttpException(
          'You can only review a lawyer after completing a consultation',
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    // Create review
    const review = new this.reviewModel({
      citizenId: new Types.ObjectId(citizenId),
      lawyerId: new Types.ObjectId(resolvedLawyerId),
      appointmentId: appointmentId ? new Types.ObjectId(appointmentId) : undefined,
      rating,
      comment,
    });

    await review.save();

    // Update lawyer's average rating
    await this.updateLawyerRating(resolvedLawyerId);

    // Notify lawyer of new review (UC-09)
    const citizenName =
      (citizen.citizenProfile as any)?.fullName || citizen.email?.split('@')[0] || 'A client';
    await this.notificationService
      .createReviewNotification(resolvedLawyerId, rating, citizenName)
      .catch(() => {});

    return {
      success: true,
      message: 'Review submitted successfully',
      data: review,
    };
  }

  // Get reviews for a lawyer
  async getLawyerReviews(lawyerId: string, page = 1, limit = 10) {
    if (!Types.ObjectId.isValid(lawyerId)) {
      throw new HttpException('Lawyer not found', HttpStatus.NOT_FOUND);
    }
    const lawyerObjectId = new Types.ObjectId(lawyerId);
    const skip = (page - 1) * limit;

    const [reviews, total] = await Promise.all([
      this.reviewModel
        .find({ lawyerId: lawyerObjectId, isVisible: true })
        .populate('citizenId', 'citizenProfile.fullName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.reviewModel.countDocuments({ lawyerId: lawyerObjectId, isVisible: true }),
    ]);

    // Get rating distribution
    const ratingDistribution = await this.reviewModel.aggregate([
      { $match: { lawyerId: new Types.ObjectId(lawyerId), isVisible: true } },
      { $group: { _id: '$rating', count: { $sum: 1 } } },
      { $sort: { _id: -1 } },
    ]);

    const distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    ratingDistribution.forEach((r) => {
      distribution[r._id as keyof typeof distribution] = r.count;
    });

    return {
      success: true,
      data: reviews,
      ratingDistribution: distribution,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // Get citizen's reviews
  async getCitizenReviews(citizenId: string) {
    if (!Types.ObjectId.isValid(citizenId)) {
      throw new HttpException('Citizen not found', HttpStatus.NOT_FOUND);
    }
    const citizenObjectId = new Types.ObjectId(citizenId);
    const reviews = await this.reviewModel
      .find({ citizenId: citizenObjectId })
      .populate('lawyerId', 'lawyerProfile.fullName lawyerProfile.profilePictureUrl')
      .sort({ createdAt: -1 })
      .exec();

    return { success: true, data: reviews };
  }

  // Get reviews received by a lawyer
  async getLawyerReceivedReviews(lawyerId: string) {
    if (!Types.ObjectId.isValid(lawyerId)) {
      throw new HttpException('Lawyer not found', HttpStatus.NOT_FOUND);
    }
    const lawyerObjectId = new Types.ObjectId(lawyerId);
    const reviews = await this.reviewModel
      .find({ lawyerId: lawyerObjectId, isVisible: true })
      .populate('citizenId', 'email citizenProfile.fullName')
      .populate('appointmentId', 'appointmentDate startTime')
      .sort({ createdAt: -1 })
      .exec();

    const stats = await this.reviewModel.aggregate([
      { $match: { lawyerId: lawyerObjectId, isVisible: true } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          averageRating: { $avg: '$rating' },
        },
      },
    ]);

    return {
      success: true,
      data: reviews,
      summary: {
        total: stats[0]?.total || 0,
        averageRating: Math.round((stats[0]?.averageRating || 0) * 10) / 10,
      },
    };
  }

  // Update a review
  async updateReview(reviewId: string, citizenId: string, rating?: number, comment?: string) {
    if (!Types.ObjectId.isValid(citizenId)) {
      throw new HttpException('Citizen not found', HttpStatus.NOT_FOUND);
    }
    const citizenObjectId = new Types.ObjectId(citizenId);
    const review = await this.reviewModel.findOne({ _id: reviewId, citizenId: citizenObjectId });
    if (!review) {
      throw new HttpException('Review not found', HttpStatus.NOT_FOUND);
    }
    if (Date.now() - new Date((review as any).createdAt).getTime() > ReviewService.REVIEW_EDIT_WINDOW_MS) {
      throw new HttpException('Review edit window has expired', HttpStatus.BAD_REQUEST);
    }

    if (rating !== undefined) {
      if (rating < 1 || rating > 5) {
        throw new HttpException('Rating must be between 1 and 5', HttpStatus.BAD_REQUEST);
      }
      review.rating = rating;
    }

    if (comment !== undefined) {
      review.comment = comment;
    }

    await review.save();

    // Update lawyer's average rating
    await this.updateLawyerRating(review.lawyerId.toString());

    return {
      success: true,
      message: 'Review updated successfully',
      data: review,
    };
  }

  // Delete a review (citizen can delete their own, admin can delete any)
  async deleteReview(reviewId: string, userId: string, isAdmin = false) {
    const query: any = { _id: reviewId };
    if (!isAdmin) {
      if (!Types.ObjectId.isValid(userId)) {
        throw new HttpException('Citizen not found', HttpStatus.NOT_FOUND);
      }
      query.citizenId = new Types.ObjectId(userId);
    }

    const review = await this.reviewModel.findOne(query);
    if (!review) {
      throw new HttpException('Review not found', HttpStatus.NOT_FOUND);
    }

    const lawyerId = review.lawyerId.toString();
    const appointmentId = review.appointmentId ? review.appointmentId.toString() : null;

    await this.reviewModel.deleteOne({ _id: reviewId });
    if (appointmentId) {
      await this.appointmentModel.updateOne({ _id: appointmentId }, { hasReview: false }).exec();
    }

    // Update lawyer's average rating
    await this.updateLawyerRating(lawyerId);

    return { success: true, message: 'Review deleted successfully' };
  }

  // Admin: Hide/unhide a review
  async toggleReviewVisibility(reviewId: string, adminNote?: string) {
    const review = await this.reviewModel.findById(reviewId);
    if (!review) {
      throw new HttpException('Review not found', HttpStatus.NOT_FOUND);
    }

    review.isVisible = !review.isVisible;
    if (adminNote) {
      review.adminNote = adminNote;
    }
    await review.save();

    // Update lawyer's average rating
    await this.updateLawyerRating(review.lawyerId.toString());

    return {
      success: true,
      message: `Review ${review.isVisible ? 'shown' : 'hidden'} successfully`,
      data: review,
    };
  }

  // Update lawyer's average rating
  private async updateLawyerRating(lawyerId: string) {
    const stats = await this.reviewModel.aggregate([
      { $match: { lawyerId: new Types.ObjectId(lawyerId), isVisible: true } },
      {
        $group: {
          _id: null,
          averageRating: { $avg: '$rating' },
          totalReviews: { $sum: 1 },
        },
      },
    ]);

    const { averageRating = 0, totalReviews = 0 } = stats[0] || {};

    await this.userModel.updateOne(
      { _id: lawyerId },
      {
        $set: {
          'lawyerProfile.averageRating': Math.round(averageRating * 10) / 10,
          'lawyerProfile.totalReviews': totalReviews,
        },
      },
    );
  }
}
