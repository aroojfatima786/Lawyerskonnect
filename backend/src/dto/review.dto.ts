import { IsInt, IsOptional, IsString, MaxLength, Min, Max, MinLength } from 'class-validator';

export class CreateReviewDto {
  @IsString()
  lawyerId: string;

  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;

  @IsOptional()
  @IsString()
  appointmentId?: string;
}

export class UpdateReviewDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}

export class ToggleVisibilityDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  adminNote?: string;
}
