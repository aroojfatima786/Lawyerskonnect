import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  LegalKnowledge,
  LegalKnowledgeDocument,
  LegalKnowledgeLanguage,
  LegalKnowledgeStatus,
} from '../schemas/legal-knowledge.schema';

const ALLOWED_CATEGORIES = [
  'Family Law',
  'Property Law',
  'Criminal Law',
  'Civil Law',
  'Rent Law',
  'Labour Law',
  'Business Law',
  'Banking Law',
  'Tax Law',
  'Consumer Law',
  'Contract Law',
  'Other',
];

@Injectable()
export class LegalKnowledgeService {
  constructor(
    @InjectModel(LegalKnowledge.name)
    private readonly legalKnowledgeModel: Model<LegalKnowledgeDocument>,
  ) {}

  private validatePayload(payload: any) {
    if (!payload?.title?.trim()) throw new HttpException('title is required', HttpStatus.BAD_REQUEST);
    if (!payload?.source?.trim()) throw new HttpException('source is required', HttpStatus.BAD_REQUEST);
    if (!payload?.content?.trim()) throw new HttpException('content is required', HttpStatus.BAD_REQUEST);
    if (!payload?.category?.trim()) throw new HttpException('category is required', HttpStatus.BAD_REQUEST);
    if (!ALLOWED_CATEGORIES.includes(payload.category)) {
      throw new HttpException('Invalid category', HttpStatus.BAD_REQUEST);
    }
  }

  async create(payload: any, adminId: string) {
    this.validatePayload(payload);
    const row = await this.legalKnowledgeModel.create({
      title: payload.title.trim(),
      source: payload.source.trim(),
      sourceUrl: payload.sourceUrl?.trim(),
      jurisdiction: payload.jurisdiction?.trim() || 'Pakistan',
      category: payload.category.trim(),
      actName: payload.actName?.trim(),
      sectionNumber: payload.sectionNumber?.trim(),
      content: payload.content.trim(),
      summary: payload.summary?.trim(),
      language:
        payload.language && Object.values(LegalKnowledgeLanguage).includes(payload.language)
          ? payload.language
          : LegalKnowledgeLanguage.ENGLISH,
      tags: Array.isArray(payload.tags) ? payload.tags.map((t: string) => String(t).trim()).filter(Boolean) : [],
      status:
        payload.status && Object.values(LegalKnowledgeStatus).includes(payload.status)
          ? payload.status
          : LegalKnowledgeStatus.ACTIVE,
      createdBy: new Types.ObjectId(adminId),
      updatedBy: new Types.ObjectId(adminId),
    });
    return { success: true, data: row };
  }

  async update(id: string, payload: any, adminId: string) {
    const existing = await this.legalKnowledgeModel.findById(id).exec();
    if (!existing) throw new HttpException('Legal knowledge entry not found', HttpStatus.NOT_FOUND);
    const next = {
      ...existing.toObject(),
      ...payload,
      updatedBy: new Types.ObjectId(adminId),
    };
    this.validatePayload(next);
    const updated = await this.legalKnowledgeModel.findByIdAndUpdate(
      id,
      {
        ...payload,
        updatedBy: new Types.ObjectId(adminId),
      },
      { new: true },
    );
    return { success: true, data: updated };
  }

  async remove(id: string) {
    const deleted = await this.legalKnowledgeModel.findByIdAndDelete(id).exec();
    if (!deleted) throw new HttpException('Legal knowledge entry not found', HttpStatus.NOT_FOUND);
    return { success: true, message: 'Legal knowledge entry deleted' };
  }

  async getById(id: string) {
    const row = await this.legalKnowledgeModel.findById(id).exec();
    if (!row) throw new HttpException('Legal knowledge entry not found', HttpStatus.NOT_FOUND);
    return { success: true, data: row };
  }

  async list(filters: any, page = 1, limit = 20) {
    const query: any = {};
    if (filters?.status) query.status = filters.status;
    if (filters?.category) query.category = filters.category;
    if (filters?.language) query.language = filters.language;
    if (filters?.search) {
      const rx = new RegExp(String(filters.search).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      query.$or = [{ title: rx }, { content: rx }, { tags: rx }, { actName: rx }, { sectionNumber: rx }];
    }
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.legalKnowledgeModel.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).exec(),
      this.legalKnowledgeModel.countDocuments(query),
    ]);
    return {
      success: true,
      data,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async searchLegalKnowledge(query: string, category?: string, language?: string, limit = 6) {
    const q = String(query || '').trim();
    if (!q) return [];
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const tokens = q
      .split(/\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 3)
      .slice(0, 10);
    const tokenRegexes = tokens.map((t) => new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
    const rx = new RegExp(escaped, 'i');
    const or: any[] = [{ title: rx }, { content: rx }, { summary: rx }, { tags: rx }, { actName: rx }, { sectionNumber: rx }];
    for (const tr of tokenRegexes) {
      or.push({ title: tr }, { content: tr }, { summary: tr }, { tags: tr }, { actName: tr }, { sectionNumber: tr });
    }
    const where: any = {
      status: LegalKnowledgeStatus.ACTIVE,
      $or: or,
    };
    if (category) where.category = category;
    if (language && Object.values(LegalKnowledgeLanguage).includes(language as LegalKnowledgeLanguage)) {
      where.language = language;
    }
    return this.legalKnowledgeModel.find(where).sort({ updatedAt: -1, createdAt: -1 }).limit(limit).exec();
  }

  getAllowedCategories() {
    return ALLOWED_CATEGORIES;
  }
}
