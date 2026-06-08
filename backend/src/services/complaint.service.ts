import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Complaint, ComplaintDocument, ComplaintCategory, ComplaintStatus } from '../schemas/complaint.schema';
import { User, UserDocument } from '../schemas/user.schema';

@Injectable()
export class ComplaintService {
  constructor(
    @InjectModel(Complaint.name) private complaintModel: Model<ComplaintDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {}

  async create(userId: string, subject: string, message: string, category?: ComplaintCategory) {
    const complaint = new this.complaintModel({
      userId: new Types.ObjectId(userId),
      subject: subject.trim(),
      message: message.trim(),
      category: category || ComplaintCategory.GENERAL,
      status: ComplaintStatus.OPEN,
    });
    await complaint.save();
    return {
      success: true,
      message: 'Complaint submitted. We will get back to you soon.',
      data: complaint,
    };
  }

  async getMyComplaints(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [list, total] = await Promise.all([
      this.complaintModel
        .find({ userId: new Types.ObjectId(userId) })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.complaintModel.countDocuments({ userId: new Types.ObjectId(userId) }),
    ]);
    return {
      success: true,
      data: list,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getById(complaintId: string, userId: string, isAdmin = false) {
    const complaint = await this.complaintModel
      .findById(complaintId)
      .populate('userId', 'email citizenProfile.fullName lawyerProfile.fullName role')
      .exec();
    if (!complaint) {
      throw new HttpException('Complaint not found', HttpStatus.NOT_FOUND);
    }
    if (!isAdmin && complaint.userId._id.toString() !== userId) {
      throw new HttpException('Forbidden', HttpStatus.FORBIDDEN);
    }
    return { success: true, data: complaint };
  }

  async getAdminComplaints(filters: { status?: string; category?: string; page?: number; limit?: number }) {
    const { status, category, page = 1, limit = 20 } = filters;
    const query: any = {};
    if (status) query.status = status;
    if (category) query.category = category;
    const skip = (page - 1) * limit;
    const [list, total] = await Promise.all([
      this.complaintModel
        .find(query)
        .populate('userId', 'email citizenProfile.fullName lawyerProfile.fullName role')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.complaintModel.countDocuments(query),
    ]);
    return {
      success: true,
      data: list,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async updateComplaint(
    complaintId: string,
    adminId: string,
    updates: { status?: ComplaintStatus; adminReply?: string },
  ) {
    const complaint = await this.complaintModel.findById(complaintId);
    if (!complaint) {
      throw new HttpException('Complaint not found', HttpStatus.NOT_FOUND);
    }
    if (updates.status) complaint.status = updates.status;
    if (updates.adminReply !== undefined) {
      complaint.adminReply = updates.adminReply.trim();
      complaint.adminRepliedAt = new Date();
      complaint.repliedBy = new Types.ObjectId(adminId);
    }
    await complaint.save();
    return { success: true, message: 'Complaint updated', data: complaint };
  }
}
