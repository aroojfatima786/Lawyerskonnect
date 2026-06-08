import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument, UserRole, VerificationStatus } from '../schemas/user.schema';
import { Appointment, AppointmentDocument } from '../schemas/appointment.schema';
import { ContactInquiry, ContactInquiryDocument } from '../schemas/contact-inquiry.schema';

@Injectable()
export class PublicService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Appointment.name) private appointmentModel: Model<AppointmentDocument>,
    @InjectModel(ContactInquiry.name) private contactInquiryModel: Model<ContactInquiryDocument>,
  ) {}

  async getPublicStats() {
    const [verifiedLawyers, totalAppointments, cityValues] = await Promise.all([
      this.userModel.countDocuments({
        role: UserRole.LAWYER,
        'lawyerProfile.verificationStatus': VerificationStatus.VERIFIED,
      }),
      this.appointmentModel.countDocuments(),
      this.userModel.distinct('lawyerProfile.city', {
        role: UserRole.LAWYER,
        lawyerProfile: { $exists: true },
        'lawyerProfile.city': { $exists: true, $nin: [null, ''] },
      }) as Promise<string[]>,
    ]);

    const citiesCovered = cityValues.filter((c) => typeof c === 'string' && c.trim().length > 0).length;

    return {
      success: true,
      data: {
        verifiedLawyers,
        totalAppointments,
        citiesCovered,
      },
    };
  }

  async submitContactInquiry(name: string, email: string, subject: string, message: string) {
    const n = name?.trim();
    const e = email?.trim().toLowerCase();
    const s = subject?.trim();
    const m = message?.trim();
    if (!n || !e || !s || !m) {
      throw new HttpException('All fields are required', HttpStatus.BAD_REQUEST);
    }
    const simpleEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!simpleEmail.test(e)) {
      throw new HttpException('Invalid email address', HttpStatus.BAD_REQUEST);
    }

    const doc = new this.contactInquiryModel({
      name: n,
      email: e,
      subject: s.slice(0, 300),
      message: m.slice(0, 5000),
    });
    await doc.save();

    return {
      success: true,
      message: 'Your message has been received. We will get back to you soon.',
      data: { id: (doc as any)._id as Types.ObjectId },
    };
  }
}
