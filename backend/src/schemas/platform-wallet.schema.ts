import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type PlatformWalletDocument = PlatformWallet & Document;

/**
 * Single-document wallet for admin/platform.
 * Citizen payments are credited here; admin releases payouts to lawyers from here.
 */
@Schema({ timestamps: true, _id: true })
export class PlatformWallet {
  @Prop({ default: 0, min: 0 })
  balancePkr: number;

  @Prop({ default: 'platform' })
  walletId: string; // single doc identifier
}

export const PlatformWalletSchema = SchemaFactory.createForClass(PlatformWallet);
