import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument, UserRole, VerificationStatus } from '../schemas/user.schema';
import { Category, CategoryDocument } from '../schemas/category.schema';
import { Appointment, AppointmentDocument, AppointmentStatus } from '../schemas/appointment.schema';
import { PaymentService } from './payment.service';
export interface LawyerSearchFilters {
  city?: string;
  practiceArea?: string;
  minExperience?: number;
  maxExperience?: number;
  minRating?: number;
  minFee?: number;
  maxFee?: number;
  acceptsOnline?: boolean;
  acceptsInPerson?: boolean;
  search?: string; // Name search
  latitude?: number;
  longitude?: number;
  radius?: number;
  page?: number;
  limit?: number;
  sortBy?: 'rating' | 'experience' | 'fee' | 'reviews' | 'distance';
  sortOrder?: 'asc' | 'desc';
}

@Injectable()
export class LawyerService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Category.name) private categoryModel: Model<CategoryDocument>,
    @InjectModel(Appointment.name) private appointmentModel: Model<AppointmentDocument>,
    private readonly paymentService: PaymentService,
  ) {}

  /** Citizen-facing search/profile: omit subscription billing fields. */
  private enrichLawyerForPublic(lawyer: UserDocument, distanceKm: number | null): Record<string, any> {
    const obj = lawyer.toObject() as Record<string, any>;
    if (obj?.lawyerProfile?.payoutAccount) {
      delete obj.lawyerProfile.payoutAccount;
    }
    this.stripSubscriptionFromPublicPayload(obj);
    return {
      ...obj,
      distanceKm,
    };
  }

  private stripSubscriptionFromPublicPayload(obj: Record<string, any>) {
    const topLevel = [
      'subscriptionTier',
      'subscriptionBadge',
      'subscriptionExpiresAt',
      'planCode',
      'activePlan',
      'isFeatured',
      'priorityRank',
      'hasActivePaidSubscription',
    ];
    for (const key of topLevel) {
      delete obj[key];
    }
    if (obj.lawyerProfile && typeof obj.lawyerProfile === 'object') {
      delete obj.lawyerProfile.subscriptionTier;
      delete obj.lawyerProfile.subscriptionBadge;
      delete obj.lawyerProfile.subscriptionExpiresAt;
    }
  }

  private toRadians(value: number) {
    return (value * Math.PI) / 180;
  }

  private calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
    const earthRadiusKm = 6371;
    const dLat = this.toRadians(lat2 - lat1);
    const dLon = this.toRadians(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return earthRadiusKm * c;
  }

  // Get all verified lawyers with filters
  async searchLawyers(filters: LawyerSearchFilters) {
    const {
      city,
      practiceArea,
      minExperience,
      maxExperience,
      minRating,
      minFee,
      maxFee,
      acceptsOnline,
      acceptsInPerson,
      search,
      latitude,
      longitude,
      radius,
      page = 1,
      limit = 10,
      sortBy = 'rating',
      sortOrder = 'desc',
    } = filters;

    // Only show verified lawyers; pending/rejected/missing status = never shown in search
    const query: any = {
      role: UserRole.LAWYER,
      isActive: { $ne: false },
      'lawyerProfile.verificationStatus': { $eq: VerificationStatus.VERIFIED },
    };

    const useLocationSearch =
      typeof latitude === 'number' && !Number.isNaN(latitude) &&
      typeof longitude === 'number' && !Number.isNaN(longitude);

    // City filter
    if (city) {
      query['lawyerProfile.city'] = { $regex: city, $options: 'i' };
    }

    // Practice area filter
    if (practiceArea) {
      query['lawyerProfile.practiceAreas'] = { $in: [practiceArea] };
    }

    // Experience filter
    if (minExperience !== undefined) {
      query['lawyerProfile.yearsOfExperience'] = { $gte: minExperience };
    }
    if (maxExperience !== undefined) {
      query['lawyerProfile.yearsOfExperience'] = {
        ...query['lawyerProfile.yearsOfExperience'],
        $lte: maxExperience,
      };
    }

    // Rating filter
    if (minRating !== undefined) {
      query['lawyerProfile.averageRating'] = { $gte: minRating };
    }

    // Fee filter
    if (minFee !== undefined) {
      query['lawyerProfile.consultationFee'] = { $gte: minFee };
    }
    if (maxFee !== undefined) {
      query['lawyerProfile.consultationFee'] = {
        ...query['lawyerProfile.consultationFee'],
        $lte: maxFee,
      };
    }

    // Consultation type filter
    if (acceptsOnline !== undefined) {
      query['lawyerProfile.acceptsOnlineConsultation'] = acceptsOnline;
    }
    if (acceptsInPerson !== undefined) {
      query['lawyerProfile.acceptsInPersonConsultation'] = acceptsInPerson;
    }

    // Name search
    if (search) {
      query['lawyerProfile.fullName'] = { $regex: search, $options: 'i' };
    }

    const radiusKm = useLocationSearch && radius && radius > 0 ? radius : 10;
    if (useLocationSearch) {
      const lat = latitude as number;
      const lng = longitude as number;
      const latDelta = radiusKm / 110.574;
      const lngDelta = radiusKm / (111.320 * Math.cos(this.toRadians(lat)) || 1);
      query['lawyerProfile.latitude'] = { $gte: lat - latDelta, $lte: lat + latDelta };
      query['lawyerProfile.longitude'] = { $gte: lng - lngDelta, $lte: lng + lngDelta };
    }

    // Sorting handled after distance calculation for proper distance-aware results

    const skip = (page - 1) * limit;

    const lawyers = await this.userModel
      .find(query)
      .select('-password -verificationCode -verificationCodeExpiry -loginOtpCode -loginOtpExpiry -passwordResetCode -passwordResetExpiry')
      .exec();

    const lawyersWithDistance = lawyers.map((lawyer) => {
      const lat = lawyer?.lawyerProfile?.latitude;
      const lng = lawyer?.lawyerProfile?.longitude;
      const distanceKm =
        useLocationSearch && typeof lat === 'number' && typeof lng === 'number'
          ? this.calculateDistanceKm(latitude as number, longitude as number, lat, lng)
          : null;
      return this.enrichLawyerForPublic(lawyer, distanceKm);
    });

    let sortedLawyers = lawyersWithDistance.sort((a, b) => {
      let comparison = 0;

      if (sortBy === 'distance' && useLocationSearch) {
        // Distance sorting
        const aDistance = a.distanceKm ?? Infinity;
        const bDistance = b.distanceKm ?? Infinity;
        comparison = aDistance - bDistance;
        // sortOrder is ignored for distance (always closest first)
      } else {
        // Sort by rating, experience, fee, or reviews
        const fieldMap: any = {
          rating: 'averageRating',
          experience: 'yearsOfExperience',
          fee: 'consultationFee',
          reviews: 'totalReviews',
        };
        const fieldName = fieldMap[sortBy] || 'averageRating';
        const aValue = a?.lawyerProfile?.[fieldName] ?? 0;
        const bValue = b?.lawyerProfile?.[fieldName] ?? 0;

        if (sortOrder === 'asc') {
          comparison = aValue - bValue;
        } else {
          comparison = bValue - aValue;
        }
      }

      // Secondary sort: if useLocationSearch and primary sort is not distance, use distance as tiebreaker
      if (comparison === 0 && useLocationSearch && sortBy !== 'distance') {
        const aDistance = a.distanceKm ?? Infinity;
        const bDistance = b.distanceKm ?? Infinity;
        comparison = aDistance - bDistance;
      }

      return comparison;
    });

    const total = sortedLawyers.length;
    const pagerLawyers = sortedLawyers.slice(skip, skip + limit);

    return {
      success: true,
      data: pagerLawyers,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // Get single lawyer profile (public — verified lawyers only)
  async getLawyerById(lawyerId: string) {
    const query: any = {
      _id: lawyerId,
      role: UserRole.LAWYER,
      isActive: { $ne: false },
      'lawyerProfile.verificationStatus': VerificationStatus.VERIFIED,
    };

    const lawyer = await this.userModel
      .findOne(query)
      .select('-password -verificationCode -verificationCodeExpiry -loginOtpCode -loginOtpExpiry -passwordResetCode -passwordResetExpiry')
      .exec();

    if (!lawyer) {
      throw new HttpException('Lawyer not found', HttpStatus.NOT_FOUND);
    }

    const data = this.enrichLawyerForPublic(lawyer, null);
    return { success: true, data };
  }

  // Get lawyer availability for a specific date (verified lawyers only)
  async getLawyerAvailability(lawyerId: string, date: string) {
    const lawyer = await this.userModel
      .findOne({
        _id: lawyerId,
        role: UserRole.LAWYER,
        isActive: { $ne: false },
        'lawyerProfile.verificationStatus': VerificationStatus.VERIFIED,
      })
      .exec();
    if (!lawyer) {
      throw new HttpException('Lawyer not found or not verified', HttpStatus.NOT_FOUND);
    }

    const dateObj = new Date(date + 'T00:00:00'); // Ensure proper date parsing
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayOfWeek = dayNames[dateObj.getDay()];

    console.log(`[Availability] Date: ${date}, Day: ${dayOfWeek}`);
    console.log(`[Availability] Lawyer availability:`, lawyer.lawyerProfile?.availability);

    // If lawyer has no availability set, use default weekday availability
    let availability = lawyer.lawyerProfile?.availability;
    if (!availability || availability.length === 0) {
      console.log('[Availability] No availability set, using defaults');
      availability = [
        { day: 'Monday', startTime: '09:00', endTime: '17:00', isAvailable: true },
        { day: 'Tuesday', startTime: '09:00', endTime: '17:00', isAvailable: true },
        { day: 'Wednesday', startTime: '09:00', endTime: '17:00', isAvailable: true },
        { day: 'Thursday', startTime: '09:00', endTime: '17:00', isAvailable: true },
        { day: 'Friday', startTime: '09:00', endTime: '17:00', isAvailable: true },
        { day: 'Saturday', startTime: '09:00', endTime: '17:00', isAvailable: false },
        { day: 'Sunday', startTime: '09:00', endTime: '17:00', isAvailable: false },
      ];
    }

    // Get lawyer's availability for this day
    const dayAvailability = availability.find(
      (slot) => slot.day.toLowerCase() === dayOfWeek.toLowerCase() && slot.isAvailable,
    );

    console.log(`[Availability] Found slot:`, dayAvailability);

    if (!dayAvailability) {
      return { success: true, availableSlots: [], message: `Lawyer is not available on ${dayOfWeek}` };
    }

    // Get booked appointments for this date
    const startOfDay = new Date(dateObj);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(dateObj);
    endOfDay.setHours(23, 59, 59, 999);

    const bookedAppointments = await this.appointmentModel
      .find({
        lawyerId,
        appointmentDate: { $gte: startOfDay, $lte: endOfDay },
        status: { $in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED] },
      })
      .select('startTime endTime')
      .exec();

    const bookedSlots = bookedAppointments.map((apt) => ({
      startTime: apt.startTime,
      endTime: apt.endTime,
    }));

    const duration = lawyer.lawyerProfile?.consultationDuration || 30;
    const nowPk = new Date(
      new Date().toLocaleString('en-US', {
        timeZone: 'Asia/Karachi',
      }),
    );
    const todayPk = `${nowPk.getFullYear()}-${String(nowPk.getMonth() + 1).padStart(2, '0')}-${String(
      nowPk.getDate(),
    ).padStart(2, '0')}`;
    const nowMinutes =
      date === todayPk ? nowPk.getHours() * 60 + nowPk.getMinutes() : undefined;

    const timeSlots = this.generateTimeSlotsWithStatus(
      dayAvailability.startTime,
      dayAvailability.endTime,
      duration,
      bookedSlots,
      nowMinutes,
    );
    const availableSlots = timeSlots
      .filter((s) => s.status === 'available')
      .map((s) => s.time);

    return {
      success: true,
      date,
      dayOfWeek,
      consultationDuration: duration,
      consultationFee: lawyer.lawyerProfile?.consultationFee || 0,
      availableSlots,
      timeSlots,
    };
  }

  private generateTimeSlotsWithStatus(
    startTime: string,
    endTime: string,
    duration: number,
    bookedSlots: { startTime: string; endTime: string }[],
    nowMinutesPk?: number,
  ): Array<{ time: string; status: 'available' | 'booked' | 'past' }> {
    const slots: Array<{ time: string; status: 'available' | 'booked' | 'past' }> = [];
    const [startHour, startMin] = startTime.split(':').map(Number);
    const [endHour, endMin] = endTime.split(':').map(Number);

    let currentHour = startHour;
    let currentMin = startMin;

    while (currentHour < endHour || (currentHour === endHour && currentMin < endMin)) {
      const slotStart = `${currentHour.toString().padStart(2, '0')}:${currentMin.toString().padStart(2, '0')}`;

      let slotEndHour = currentHour;
      let slotEndMin = currentMin + duration;
      if (slotEndMin >= 60) {
        slotEndHour += Math.floor(slotEndMin / 60);
        slotEndMin = slotEndMin % 60;
      }

      if (slotEndHour > endHour || (slotEndHour === endHour && slotEndMin > endMin)) {
        break;
      }

      const isBooked = bookedSlots.some(
        (booked) =>
          booked.startTime === slotStart ||
          (slotStart >= booked.startTime && slotStart < booked.endTime),
      );

      const slotMinutes = currentHour * 60 + currentMin;
      const isPast =
        typeof nowMinutesPk === 'number' && slotMinutes <= nowMinutesPk;

      let status: 'available' | 'booked' | 'past' = 'available';
      if (isBooked) status = 'booked';
      else if (isPast) status = 'past';

      slots.push({ time: slotStart, status });

      currentMin += duration;
      if (currentMin >= 60) {
        currentHour += Math.floor(currentMin / 60);
        currentMin = currentMin % 60;
      }
    }

    return slots;
  }

  // Get all categories
  async getCategories() {
    const categories = await this.categoryModel.find({ isActive: true }).sort({ order: 1 }).exec();
    return { success: true, data: categories };
  }

  // Get cities with lawyers
  async getCities() {
    const cities = await this.userModel.distinct('lawyerProfile.city', {
      role: UserRole.LAWYER,
      'lawyerProfile.verificationStatus': VerificationStatus.VERIFIED,
      'lawyerProfile.city': { $nin: [null, ''] },
    });
    return { success: true, data: cities.filter(Boolean).sort() };
  }

  // Update lawyer profile (for lawyer users)
  async updateLawyerProfile(lawyerId: string, updateData: any) {
    const lawyer = await this.userModel.findById(lawyerId);
    if (!lawyer || lawyer.role !== UserRole.LAWYER) {
      throw new HttpException('Lawyer not found', HttpStatus.NOT_FOUND);
    }

    // Initialize lawyerProfile if it doesn't exist
    if (!lawyer.lawyerProfile) {
      lawyer.lawyerProfile = {};
    }

    // Update lawyer profile fields
    const allowedFields = [
      'fullName', 'phoneNumber', 'city', 'country', 'practiceAreas',
      'yearsOfExperience', 'officeAddress', 'bio', 'profilePictureUrl',
      'consultationFee', 'consultationDuration', 'acceptsOnlineConsultation',
      'acceptsInPersonConsultation', 'availability', 'languages', 'education',
      'courtAssociations', 'latitude', 'longitude',
    ];

    for (const field of allowedFields) {
      if (updateData[field] !== undefined) {
        (lawyer.lawyerProfile as any)[field] = updateData[field];
      }
    }

    if (updateData?.payoutAccount) {
      const payout = updateData.payoutAccount;
      const method = payout.method;
      if (!['bank', 'jazzcash', 'easypaisa'].includes(method)) {
        throw new HttpException('Invalid payout method', HttpStatus.BAD_REQUEST);
      }
      if (!payout.accountTitle) {
        throw new HttpException('Payout account title is required', HttpStatus.BAD_REQUEST);
      }
      if (method === 'bank') {
        if (!payout.bankName) {
          throw new HttpException('Bank name is required for bank payout', HttpStatus.BAD_REQUEST);
        }
        if (!payout.accountNumber && !payout.iban) {
          throw new HttpException('Account number or IBAN is required for bank payout', HttpStatus.BAD_REQUEST);
        }
      } else if (!payout.mobileNumber) {
        throw new HttpException('Mobile number is required for wallet payout method', HttpStatus.BAD_REQUEST);
      }
      (lawyer.lawyerProfile as any).payoutAccount = {
        method,
        accountTitle: payout.accountTitle,
        bankName: payout.bankName,
        accountNumber: payout.accountNumber,
        iban: payout.iban,
        mobileNumber: payout.mobileNumber,
        isVerified: false,
        updatedAt: new Date(),
      };
    }

    await lawyer.save();

    if (updateData?.payoutAccount) {
      await this.paymentService.autoReleasePendingPayoutsForLawyer(lawyerId).catch(() => undefined);
    }

    return {
      success: true,
      message: 'Profile updated successfully',
      data: lawyer.lawyerProfile,
    };
  }

  // Update lawyer availability
  async updateAvailability(lawyerId: string, availability: any[]) {
    const lawyer = await this.userModel.findById(lawyerId);
    if (!lawyer || lawyer.role !== UserRole.LAWYER) {
      throw new HttpException('Lawyer not found', HttpStatus.NOT_FOUND);
    }

    if (!lawyer.lawyerProfile) {
      lawyer.lawyerProfile = {} as any;
    }
    lawyer.lawyerProfile!.availability = availability;
    await lawyer.save();

    return {
      success: true,
      message: 'Availability updated successfully',
      data: lawyer.lawyerProfile?.availability,
    };
  }
}
