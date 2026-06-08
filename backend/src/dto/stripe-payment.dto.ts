import { IsIn, IsNumber, IsOptional, IsString, Length, Min, Matches } from 'class-validator';

export class CreateStripeSessionDto {
  @IsNumber()
  @Min(0)
  amount: number;

  @IsString()
  @Matches(/^[A-Za-z]{3}$/)
  currency: string;

  @IsString()
  @Length(24, 24)
  orderId: string;

  @IsString()
  @Length(24, 24)
  userId: string;

  @IsOptional()
  @IsString()
  @IsIn(['jazzcash', 'easypaisa'])
  walletMethod?: 'jazzcash' | 'easypaisa';

  @IsOptional()
  @IsString()
  @IsIn(['appointment', 'subscription', 'registration'])
  checkoutType?: 'appointment' | 'subscription' | 'registration';
}
