import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

import { InjectModel } from '@nestjs/mongoose';

import { Model, Types } from 'mongoose';

import { Appointment, AppointmentDocument, AppointmentStatus } from '../schemas/appointment.schema';

import { User, UserDocument } from '../schemas/user.schema';

import {

  getPlanLimits,

  SubscriptionPlanCode,

  SubscriptionPlanLimits,

  SubscriptionBillingCycle,

} from '../config/subscription-plans';

import { LawyerSubscriptionService } from './lawyer-subscription.service';



const PK_TIMEZONE = 'Asia/Karachi';



@Injectable()

export class LawyerPlanLimitsService {

  constructor(

    @InjectModel(User.name) private userModel: Model<UserDocument>,

    @InjectModel(Appointment.name) private appointmentModel: Model<AppointmentDocument>,

    private lawyerSubscriptionService: LawyerSubscriptionService,

  ) {}



  /** Current calendar month window in Pakistan time (stored as UTC Date bounds). */

  getCurrentMonthWindow(): { start: Date; end: Date; label: string } {

    const parts = new Intl.DateTimeFormat('en-CA', {

      timeZone: PK_TIMEZONE,

      year: 'numeric',

      month: '2-digit',

    }).formatToParts(new Date());

    const year = Number(parts.find((p) => p.type === 'year')?.value || new Date().getFullYear());

    const month = Number(parts.find((p) => p.type === 'month')?.value || 1);

    const label = `${year}-${String(month).padStart(2, '0')}`;

    const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));

    const end = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));

    return { start, end, label };

  }



  async getEffectivePlanContext(lawyerId: string): Promise<{

    planCode: SubscriptionPlanCode;

    billingCycle: 'monthly' | 'yearly';

  }> {

    const active = await this.lawyerSubscriptionService.findEffectiveActiveSubscription(lawyerId);

    if (active?.planCode) {

      const cycle = active.billingCycle === 'yearly' ? 'yearly' : 'monthly';

      return { planCode: active.planCode as SubscriptionPlanCode, billingCycle: cycle };

    }

    return { planCode: 'free', billingCycle: 'monthly' };

  }



  async getEffectivePlanCode(lawyerId: string): Promise<SubscriptionPlanCode> {

    const ctx = await this.getEffectivePlanContext(lawyerId);

    return ctx.planCode;

  }



  private async resolveLimits(lawyerId: string): Promise<{

    planCode: SubscriptionPlanCode;

    billingCycle: 'monthly' | 'yearly';

    limits: SubscriptionPlanLimits;

  }> {

    const ctx = await this.getEffectivePlanContext(lawyerId);

    return {

      ...ctx,

      limits: getPlanLimits(ctx.planCode, ctx.billingCycle),

    };

  }



  async countMonthlyAppointments(lawyerId: string): Promise<number> {

    const { start, end } = this.getCurrentMonthWindow();

    return this.appointmentModel.countDocuments({

      lawyerId: new Types.ObjectId(lawyerId),

      createdAt: { $gte: start, $lt: end },

      status: {

        $nin: [AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW],

      },

    });

  }



  async getUsageSummary(lawyerId: string) {

    const { planCode, billingCycle, limits } = await this.resolveLimits(lawyerId);

    const { label: monthLabel } = this.getCurrentMonthWindow();

    const appointmentsUsed = await this.countMonthlyAppointments(lawyerId);



    return {

      planCode,

      billingCycle,

      monthLabel,

      limits,

      usage: {

        appointments: appointmentsUsed,

      },

      remaining: {

        appointments: Math.max(0, limits.appointmentsPerMonth - appointmentsUsed),

      },

    };

  }



  private limitExceededMessage(

    limits: SubscriptionPlanLimits,

    planCode: SubscriptionPlanCode,

    billingCycle: SubscriptionBillingCycle,

  ): string {

    const cycleLabel = billingCycle === 'yearly' ? 'yearly' : 'monthly';

    return `This lawyer has reached the monthly appointment limit (${limits.appointmentsPerMonth}) on the ${planCode} ${cycleLabel} plan. Try again next month or choose another lawyer.`;

  }



  async assertLawyerCanReceiveAppointment(lawyerId: string): Promise<void> {

    const { planCode, billingCycle, limits } = await this.resolveLimits(lawyerId);

    const used = await this.countMonthlyAppointments(lawyerId);

    if (used >= limits.appointmentsPerMonth) {

      throw new HttpException(

        {

          code: 'SUBSCRIPTION_APPOINTMENT_LIMIT',

          message: this.limitExceededMessage(limits, planCode, billingCycle),

          planCode,

          billingCycle,

          limit: limits.appointmentsPerMonth,

          used,

        },

        HttpStatus.FORBIDDEN,

      );

    }

  }

}

