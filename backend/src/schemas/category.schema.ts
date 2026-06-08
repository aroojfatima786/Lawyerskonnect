import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type CategoryDocument = Category & Document;

@Schema({ timestamps: true })
export class Category {
  @Prop({ required: true, unique: true, trim: true })
  name: string;

  @Prop({ required: true, unique: true, trim: true, lowercase: true })
  slug: string;

  @Prop({ trim: true, maxlength: 500 })
  description?: string;

  @Prop({ trim: true })
  icon?: string; // Icon name or URL

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: 0 })
  lawyerCount: number; // Number of lawyers in this category

  @Prop({ default: 0 })
  order: number; // Display order
}

export const CategorySchema = SchemaFactory.createForClass(Category);

// Default categories to seed
export const DEFAULT_CATEGORIES = [
  { name: 'Family Law', slug: 'family-law', description: 'Divorce, custody, adoption, domestic issues' },
  { name: 'Criminal Law', slug: 'criminal-law', description: 'Criminal defense, prosecution matters' },
  { name: 'Civil Law', slug: 'civil-law', description: 'Civil disputes, contracts, property' },
  { name: 'Corporate Law', slug: 'corporate-law', description: 'Business law, company formation, mergers' },
  { name: 'Property Law', slug: 'property-law', description: 'Real estate, land disputes, property transfer' },
  { name: 'Tax Law', slug: 'tax-law', description: 'Tax planning, disputes, compliance' },
  { name: 'Banking Law', slug: 'banking-law', description: 'Banking regulations, financial disputes' },
  { name: 'Labor Law', slug: 'labor-law', description: 'Employment disputes, worker rights' },
  { name: 'Immigration Law', slug: 'immigration-law', description: 'Visas, citizenship, immigration matters' },
  { name: 'Intellectual Property', slug: 'intellectual-property', description: 'Patents, trademarks, copyrights' },
  { name: 'Constitutional Law', slug: 'constitutional-law', description: 'Fundamental rights, constitutional matters' },
  { name: 'Consumer Protection', slug: 'consumer-protection', description: 'Consumer rights, product liability' },
  { name: 'Cyber Law', slug: 'cyber-law', description: 'Digital crimes, online disputes, data protection' },
  { name: 'Insurance Law', slug: 'insurance-law', description: 'Insurance claims, disputes' },
  { name: 'Environmental Law', slug: 'environmental-law', description: 'Environmental regulations, compliance' },
];
