import { IsDateString, IsInt, IsOptional, IsString, Matches, MaxLength, Min, MinLength, IsUrl } from 'class-validator';
import { ConsultationType } from '../schemas/appointment.schema';
import { IsEnum } from 'class-validator';

export class CreateAppointmentDto {
  @IsString()
  lawyerId: string;

  @IsDateString()
  appointmentDate: string;

  @Matches(/^\d{2}:\d{2}$/)
  startTime: string;

  @IsOptional()
  @IsInt()
  @Min(15)
  duration?: number;

  @IsOptional()
  @IsEnum(ConsultationType)
  consultationType?: ConsultationType;

  @IsOptional()
  @IsString()
  @MaxLength(1500)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  caseCategory?: string;
}

export class ConfirmAppointmentDto {
  @IsOptional()
  @IsUrl({ require_protocol: true })
  meetingLink?: string;
}

export class CancelAppointmentDto {
  @IsString()
  @MinLength(5)
  @MaxLength(300)
  reason: string;
}

export class RescheduleAppointmentDto {
  @IsDateString()
  newDate: string;

  @Matches(/^\d{2}:\d{2}$/)
  newStartTime: string;

  @IsString()
  @MinLength(5)
  @MaxLength(300)
  reason: string;
}

export class CompleteAppointmentDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class UpdateMeetingLinkDto {
  @IsUrl({ require_protocol: true })
  meetingLink: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  meetingPassword?: string;
}
