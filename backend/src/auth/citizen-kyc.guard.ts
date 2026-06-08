import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument, UserRole } from '../schemas/user.schema';

@Injectable()
export class CitizenKycGuard implements CanActivate {
  constructor(@InjectModel(User.name) private readonly userModel: Model<UserDocument>) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const userId = req?.user?.userId as string | undefined;
    const role = req?.user?.role as UserRole | undefined;
    if (!userId || role !== UserRole.CITIZEN) return true;

    const user = await this.userModel
      .findById(userId)
      .select('isProfileComplete citizenProfile.kycReview')
      .lean()
      .exec();
    if (!user) throw new ForbiddenException('User not found');

    const kyc = user.citizenProfile?.kycReview;
    const isIdentityPassed = !!(kyc?.ocrMatched && kyc?.faceMatchPassed);
    if (!user.isProfileComplete || !isIdentityPassed) {
      throw new ForbiddenException(
        'Complete profile and CNIC identity verification before using this feature.',
      );
    }
    return true;
  }
}
