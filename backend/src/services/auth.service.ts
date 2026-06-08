import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';
import * as crypto from 'crypto';
import { User, UserDocument, UserRole } from '../schemas/user.schema';
import { NotificationService } from './notification.service';
import { EmailService } from './email.service';
import { LawyerRegistrationService } from './lawyer-registration.service';
import { StripePaymentService } from './stripe-payment.service';
import { Response } from 'express';
import { getLawyerRegistrationFeePkr } from '../config/lawyer-registration';

type Role = UserRole; // 'citizen' | 'lawyer' | 'admin'

@Injectable()
export class AuthService {
  private readonly jwtSecret: string;
  private readonly verificationTtlMs = 30 * 60 * 1000;
  private readonly otpTtlMs = 5 * 60 * 1000;

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private notificationService: NotificationService,
    private emailService: EmailService,
    private lawyerRegistrationService: LawyerRegistrationService,
    private stripePaymentService: StripePaymentService,
  ) {
    const jwtSecret = process.env.JWT_SECRET?.trim();
    if (!jwtSecret) {
      throw new Error('JWT_SECRET is required for authentication');
    }
    this.jwtSecret = jwtSecret;
  }

  // -------------------------
  // Helpers
  // -------------------------
  private normalizeEmail(email: string) {
    return email.toLowerCase().trim();
  }

  private generateCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  private hashCode(raw: string) {
    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  private toAuthUserPayload(user: UserDocument) {
    return {
      _id: user._id,
      email: user.email,
      role: user.role,
      emailVerified: user.emailVerified,
      isProfileComplete: user.isProfileComplete,
      lawyerRegistrationFeePaid:
        user.role === UserRole.LAWYER ? user.lawyerRegistrationFeePaid !== false : true,
      citizenProfile: user.citizenProfile ?? null,
      lawyerProfile: user.lawyerProfile ?? null,
      paymentInfo: user.paymentInfo ?? null,
    };
  }

  private async assertLawyerRegistrationPaid(user: UserDocument) {
    if (user.role !== UserRole.LAWYER || user.lawyerRegistrationFeePaid !== false) {
      return;
    }

    const userId = `${user._id}`;
    await this.lawyerRegistrationService.ensureRegistrationPaidFromRecords(userId);

    let fresh = await this.userModel.findById(user._id).exec();
    if (fresh?.lawyerRegistrationFeePaid === true) {
      user.lawyerRegistrationFeePaid = true;
      user.lawyerRegistrationPaidAt = fresh.lawyerRegistrationPaidAt;
      return;
    }

    if (this.stripePaymentService.isStripeConfigured()) {
      await this.stripePaymentService.syncRegistrationPaymentAfterStripeReturn(userId);
      await this.lawyerRegistrationService.ensureRegistrationPaidFromRecords(userId);
      fresh = await this.userModel.findById(user._id).exec();
      if (fresh?.lawyerRegistrationFeePaid === true) {
        user.lawyerRegistrationFeePaid = true;
        user.lawyerRegistrationPaidAt = fresh.lawyerRegistrationPaidAt;
        return;
      }
    }

    if (user.role === UserRole.LAWYER && user.lawyerRegistrationFeePaid === false) {
      throw new HttpException(
        {
          success: false,
          code: 'REGISTRATION_PAYMENT_REQUIRED',
          message: `Please pay the lawyer registration fee (Rs. ${getLawyerRegistrationFeePkr().toLocaleString('en-PK')}) to activate your account.`,
          userId,
          amount: getLawyerRegistrationFeePkr(),
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
  }

  private signJwt(user: UserDocument) {
    return jwt.sign(
      { userId: user._id, email: user.email, role: user.role },
      this.jwtSecret,
      { expiresIn: '24h' },
    );
  }

  async getGoogleAuthUrl(role?: Role) {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;

    if (!clientId || !redirectUri) {
      throw new HttpException(
        'Google OAuth configuration is missing',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', 'openid email profile');
    authUrl.searchParams.set('access_type', 'online');
    authUrl.searchParams.set('prompt', 'select_account');
    authUrl.searchParams.set('state', role === UserRole.LAWYER ? UserRole.LAWYER : UserRole.CITIZEN);

    return authUrl.toString();
  }

  private async exchangeGoogleCode(code: string) {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirectUri) {
      throw new HttpException(
        'Google OAuth configuration is missing',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }).toString(),
    });

    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok || !tokenData.access_token) {
      throw new HttpException(
        'Failed to exchange Google OAuth code',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });

    const profile = await userInfoResponse.json();
    if (!userInfoResponse.ok || !profile?.email) {
      throw new HttpException(
        'Failed to retrieve Google profile information',
        HttpStatus.UNAUTHORIZED,
      );
    }

    if (!profile.email_verified) {
      throw new HttpException(
        'Google email is not verified',
        HttpStatus.UNAUTHORIZED,
      );
    }

    return profile as {
      email: string;
      email_verified: boolean;
      name?: string;
      picture?: string;
      sub?: string;
    };
  }

  async signInWithGoogleCode(code: string, role: Role = UserRole.CITIZEN) {
    try {
      const profile = await this.exchangeGoogleCode(code);
      const normalizedEmail = this.normalizeEmail(profile.email);

      let user = await this.userModel.findOne({ email: normalizedEmail });
      if (user) {
        this.assertRole(user, role);
        if (!user.emailVerified) {
          user.emailVerified = true;
        }
        if (role === UserRole.LAWYER && user.lawyerRegistrationFeePaid === undefined) {
          user.lawyerRegistrationFeePaid = true;
        }
      } else {
        const randomPassword = Math.random().toString(36).slice(2) + Date.now();
        const hashedPassword = await bcrypt.hash(randomPassword, 10);

        user = new this.userModel({
          email: normalizedEmail,
          password: hashedPassword,
          role,
          emailVerified: profile.email_verified ?? true,
          isProfileComplete: false,
          verificationCode: null,
          verificationCodeExpiry: null,
          skipNextLoginOtp: true,
          citizenProfile: null,
          lawyerProfile: null,
          paymentInfo: null,
          lawyerRegistrationFeePaid: role === UserRole.LAWYER ? false : undefined,
        });
      }

      await user.save();

      const token = this.signJwt(user);
      return {
        success: true,
        message: 'Signed in with Google successfully',
        token,
        user: this.toAuthUserPayload(user),
        requiresRegistrationPayment:
          user.role === UserRole.LAWYER && user.lawyerRegistrationFeePaid === false,
        registrationFeeAmount:
          user.role === UserRole.LAWYER && user.lawyerRegistrationFeePaid === false
            ? getLawyerRegistrationFeePkr()
            : undefined,
      };
    } catch (error) {
      throw new HttpException(
        (error as any)?.message || 'Google login failed',
        (error as any)?.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private async ensureEmailVerifiedOrResend(user: UserDocument) {
    if (process.env.SKIP_EMAIL_VERIFICATION === 'true') return;
    if (user.emailVerified) return;

    const verificationCode = this.generateCode();
    const verificationCodeExpiry = new Date(Date.now() + this.otpTtlMs);

    user.verificationCode = this.hashCode(verificationCode);
    user.verificationCodeExpiry = verificationCodeExpiry;
    await user.save();

    await this.emailService.sendVerificationEmail(
      user.email,
      verificationCode,
      `${user._id}`,
    );

    throw new HttpException(
      {
        success: false,
        code: 'EMAIL_NOT_VERIFIED',
        message:
          'Your email is not verified. We’ve sent you a new verification code. Please check your inbox.',
        userId: `${user._id}`,
        email: user.email,
      },
      HttpStatus.UNAUTHORIZED,
    );
  }

  private assertRole(user: UserDocument, role?: Role) {
    if (!role) return;
    if (user.role !== role) {
      throw new HttpException(
        {
          success: false,
          code: 'ROLE_MISMATCH',
          message: `This account is not a ${role}.`,
        },
        HttpStatus.UNAUTHORIZED,
      );
    }
  }

  // =========================================================
  // 1) SIGNUP (email + password only) + email verification
  // =========================================================
  async signup(email: string, password: string, role: Role = UserRole.CITIZEN) {
    try {
      const normalizedEmail = this.normalizeEmail(email);

      const existingUser = await this.userModel.findOne({ email: normalizedEmail });

      if (existingUser && existingUser.emailVerified) {
        throw new HttpException(
          {
            success: false,
            code: 'USER_ALREADY_EXISTS',
            message: 'User already exists. Please sign in.',
          },
          HttpStatus.CONFLICT,
        );
      }

      if (existingUser && !existingUser.emailVerified) {
        const verificationCode = this.generateCode();
        const verificationCodeExpiry = new Date(Date.now() + this.verificationTtlMs);

        // Update password if it was re-sent
        const hashedPassword = await bcrypt.hash(password, 10);
        existingUser.password = hashedPassword;
        existingUser.verificationCode = this.hashCode(verificationCode);
        existingUser.verificationCodeExpiry = verificationCodeExpiry;
        existingUser.skipNextLoginOtp = true;

        existingUser.role = role;
        if (role === UserRole.LAWYER && existingUser.lawyerRegistrationFeePaid === undefined) {
          existingUser.lawyerRegistrationFeePaid = false;
        }

        await existingUser.save();

        await this.emailService.sendVerificationEmail(
          normalizedEmail,
          verificationCode,
          `${existingUser._id}`,
        );

        return {
          success: true,
          message:
            'Account already exists but is not verified. A new verification code has been sent to your email.',
          userId: (existingUser._id as any).toString(),
          requiresEmailVerification: true,
          requiresRegistrationPayment:
            role === UserRole.LAWYER && existingUser.lawyerRegistrationFeePaid === false,
        };
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      const verificationCode = this.generateCode();
      const verificationCodeExpiry = new Date(Date.now() + this.verificationTtlMs);

      const isLawyerSignup = role === UserRole.LAWYER;

      const user = new this.userModel({
        email: normalizedEmail,
        password: hashedPassword,
        role,
        emailVerified: false,
        isProfileComplete: false,

        verificationCode: this.hashCode(verificationCode),
        verificationCodeExpiry,

        skipNextLoginOtp: true,

        citizenProfile: null,
        lawyerProfile: null,
        paymentInfo: null,
        lawyerRegistrationFeePaid: isLawyerSignup ? false : undefined,
      });

      await user.save();

      await this.emailService.sendVerificationEmail(
        normalizedEmail,
        verificationCode,
        `${user._id}`,
      );

      return {
        success: true,
        message: isLawyerSignup
          ? 'Account created. Please verify your email, then pay the registration fee.'
          : 'User created successfully. Please check your email for the verification code.',
        userId: (user._id as any).toString(),
        requiresEmailVerification: true,
        requiresRegistrationPayment: isLawyerSignup,
      };
    } catch (error) {
      throw new HttpException(
        (error as any)?.message || 'Something went wrong',
        (error as any)?.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // =========================================================
  // 2) VERIFY EMAIL
  // =========================================================
  async verifyEmail(code: string, userId?: string) {
    try {
      const hashed = this.hashCode(code);
      const user = userId ? await this.userModel.findById(userId) : await this.userModel.findOne({ verificationCode: hashed });

      if (!user || !user.verificationCodeExpiry || new Date() > user.verificationCodeExpiry || user.verificationCode !== hashed) {
        throw new HttpException('Invalid or expired verification code', HttpStatus.BAD_REQUEST);
      }

      if (user.emailVerified) {
        throw new HttpException('Email already verified', HttpStatus.BAD_REQUEST);
      }

      user.emailVerified = true;
      user.verificationCode = null;
      user.verificationCodeExpiry = null;

      user.skipNextLoginOtp = true;

      await user.save();

      const requiresRegistrationPayment =
        user.role === UserRole.LAWYER && user.lawyerRegistrationFeePaid !== true;

      return {
        success: true,
        message: 'Email verified successfully',
        requiresRegistrationPayment,
        lawyerRegistrationFeePaid: user.lawyerRegistrationFeePaid === true,
        userId: `${user._id}`,
        email: user.email,
        role: user.role,
      };
    } catch (error) {
      throw new HttpException(
        (error as any).message || 'Something went wrong',
        (error as any).status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // =========================================================
  // 3) SIGNIN (direct) - keep for admin / legacy usage
  // =========================================================
  async signin(email: string, password: string, role?: Role) {
    try {
      const normalizedEmail = this.normalizeEmail(email);
      const user = await this.userModel.findOne({ email: normalizedEmail });

      if (!user) {
        throw new HttpException(
          {
            success: false,
            code: 'ACCOUNT_NOT_FOUND',
            message: 'Account does not exist. Please sign up first.',
          },
          HttpStatus.NOT_FOUND,
        );
      }

      this.assertRole(user, role);

      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        throw new HttpException(
          {
            success: false,
            code: 'INVALID_PASSWORD',
            message: 'Incorrect password. Please try again.',
          },
          HttpStatus.UNAUTHORIZED,
        );
      }

      await this.ensureEmailVerifiedOrResend(user);
      await this.assertLawyerRegistrationPaid(user);

      const token = this.signJwt(user);

      return {
        success: true,
        message: 'Signed in successfully',
        token,
        user: this.toAuthUserPayload(user),
      };
    } catch (error) {
      throw new HttpException(
        (error as any)?.message || 'Something went wrong',
        (error as any)?.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // =========================================================
  // 4) SIGNIN INIT (AUTH_LOGIN_OTP_ENABLED=true => OTP, false => direct JWT)
  // =========================================================
  async signinInit(email: string, password: string, role?: Role) {
    const loginOtpEnabled = process.env.AUTH_LOGIN_OTP_ENABLED === 'true';
    try {
      const normalizedEmail = this.normalizeEmail(email);
      const user = await this.userModel.findOne({ email: normalizedEmail });

      if (!user) {
        throw new HttpException(
          {
            success: false,
            code: 'ACCOUNT_NOT_FOUND',
            message: 'Account does not exist. Please sign up first.',
          },
          HttpStatus.NOT_FOUND,
        );
      }

      this.assertRole(user, role);

      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        throw new HttpException(
          {
            success: false,
            code: 'INVALID_PASSWORD',
            message: 'Incorrect password. Please try again.',
          },
          HttpStatus.UNAUTHORIZED,
        );
      }

      const requiresLoginOtp = loginOtpEnabled && user.role !== UserRole.ADMIN;
      if (requiresLoginOtp) {
        if (user.role === UserRole.LAWYER && user.lawyerRegistrationFeePaid === false) {
          await this.assertLawyerRegistrationPaid(user);
        }
        await this.ensureEmailVerifiedOrResend(user);

        if (user.skipNextLoginOtp) {
          user.skipNextLoginOtp = false;
          user.loginOtpCode = null;
          user.loginOtpExpiry = null;
          user.loginOtpAttempts = 0;
          await user.save();

          const token = this.signJwt(user);

          return {
            success: true,
            message: 'Signed in successfully',
            token,
            user: this.toAuthUserPayload(user),
            skipOtp: true,
          };
        }

        const loginOtpCode = this.generateCode();
        const loginOtpExpiry = new Date(Date.now() + this.otpTtlMs);

        user.loginOtpCode = this.hashCode(loginOtpCode);
        user.loginOtpExpiry = loginOtpExpiry;
        user.loginOtpAttempts = 0;
        await user.save();

        await this.emailService.sendLoginOtpEmail(user.email, loginOtpCode);

        return {
          success: true,
          message: 'Login OTP sent to your email',
          userId: (user._id as any).toString(),
          expiresInSeconds: 300,
          expiresAt: loginOtpExpiry.toISOString(),
        };
      }

      // Direct login (AUTH_LOGIN_OTP_ENABLED !== 'true')
      if (user.role === UserRole.LAWYER && user.lawyerRegistrationFeePaid === false) {
        await this.assertLawyerRegistrationPaid(user);
      }
      await this.ensureEmailVerifiedOrResend(user);

      user.loginOtpCode = null;
      user.loginOtpExpiry = null;
      user.loginOtpAttempts = 0;
      await user.save();

      const token = this.signJwt(user);

      return {
        success: true,
        message: 'Signed in successfully',
        token,
        user: this.toAuthUserPayload(user),
        skipOtp: true,
      };
    } catch (error) {
      throw new HttpException(
        (error as any).message || 'Something went wrong',
        (error as any).status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // =========================================================
  // 5) VERIFY SIGNIN OTP (max attempts = 3)
  // =========================================================
  async verifySigninOtp(email: string, code: string, role?: Role) {
    try {
      const normalizedEmail = this.normalizeEmail(email);
      const user = (await this.userModel.findOne({ email: normalizedEmail })) as UserDocument | null;

      if (!user) {
        throw new HttpException('Invalid email or OTP', HttpStatus.BAD_REQUEST);
      }

      this.assertRole(user, role);
      if (user.role === UserRole.ADMIN) {
        throw new HttpException('Admin login does not use OTP', HttpStatus.BAD_REQUEST);
      }

      await this.ensureEmailVerifiedOrResend(user);
      if (user.role === UserRole.LAWYER && user.lawyerRegistrationFeePaid === false) {
        await this.assertLawyerRegistrationPaid(user);
      }

      // Enforce attempt limit
      const attempts = user.loginOtpAttempts ?? 0;
      if (attempts >= 3) {
        throw new HttpException(
          { success: false, code: 'OTP_ATTEMPTS_EXCEEDED', message: 'Too many OTP attempts. Please resend OTP.' },
          HttpStatus.BAD_REQUEST,
        );
      }

      const hashed = this.hashCode(code);
      const invalid =
        !user.loginOtpCode ||
        !user.loginOtpExpiry ||
        user.loginOtpCode !== hashed ||
        new Date() > user.loginOtpExpiry;

      if (invalid) {
        user.loginOtpAttempts = attempts + 1;
        await user.save();
        throw new HttpException('Invalid or expired OTP', HttpStatus.BAD_REQUEST);
      }

      // Success: clear OTP
      user.loginOtpCode = null;
      user.loginOtpExpiry = null;
      user.loginOtpAttempts = 0;
      await user.save();

      const token = this.signJwt(user);

      return {
        success: true,
        message: 'Signed in successfully',
        token,
        user: this.toAuthUserPayload(user),
      };
    } catch (error) {
      throw new HttpException(
        (error as any).message || 'Something went wrong',
        (error as any).status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // =========================================================
  // 6) RESEND SIGNIN OTP
  // =========================================================
  async resendSigninOtp(email: string, role?: Role) {
    try {
      const normalizedEmail = this.normalizeEmail(email);
      const user = await this.userModel.findOne({ email: normalizedEmail });

      if (!user) {
        throw new HttpException('Invalid email', HttpStatus.BAD_REQUEST);
      }

      this.assertRole(user, role);
      if (user.role === UserRole.ADMIN) {
        throw new HttpException('Admin login does not use OTP', HttpStatus.BAD_REQUEST);
      }

      await this.ensureEmailVerifiedOrResend(user);

      const loginOtpCode = this.generateCode();
      const loginOtpExpiry = new Date(Date.now() + this.otpTtlMs);

      user.loginOtpCode = this.hashCode(loginOtpCode);
      user.loginOtpExpiry = loginOtpExpiry;
      user.loginOtpAttempts = 0;
      await user.save();

      await this.emailService.sendLoginOtpEmail(user.email, loginOtpCode);

      return {
        success: true,
        message: 'Login OTP resent to your email',
        expiresInSeconds: 300,
        expiresAt: loginOtpExpiry.toISOString(),
      };
    } catch (error) {
      throw new HttpException(
        (error as any).message || 'Something went wrong',
        (error as any).status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async resendVerificationCode(userId: string) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    if (user.emailVerified) return { success: true, message: 'Email already verified' };
    const verificationCode = this.generateCode();
    user.verificationCode = this.hashCode(verificationCode);
    user.verificationCodeExpiry = new Date(Date.now() + this.verificationTtlMs);
    await user.save();
    await this.emailService.sendVerificationEmail(user.email, verificationCode, `${user._id}`);
    return { success: true, message: 'Verification code sent', userId: `${user._id}` };
  }

  // =========================================================
  // 7) COMPLETE PROFILE (Citizen / Lawyer) - NEW
  // =========================================================
  async completeProfile(userId: string, payload: any) {
    try {
      const user = await this.userModel.findById(userId);
      if (!user) throw new HttpException('User not found', HttpStatus.NOT_FOUND);

      if (user.role === UserRole.LAWYER) {
        await this.assertLawyerRegistrationPaid(user);
      }

      // Common payment info
      if (payload?.paymentInfo) {
        user.paymentInfo = {
          ...(user.paymentInfo || {}),
          methodType: payload.paymentInfo.methodType ?? user.paymentInfo?.methodType ?? null,
          accountTitle: payload.paymentInfo.accountTitle ?? user.paymentInfo?.accountTitle,
          accountIdentifier: payload.paymentInfo.accountIdentifier ?? user.paymentInfo?.accountIdentifier,
        } as any;
      }

      if (user.role === UserRole.CITIZEN) {
        user.citizenProfile = {
          ...(user.citizenProfile || {}),
          fullName: payload.fullName ?? user.citizenProfile?.fullName,
          phoneNumber: payload.phoneNumber ?? user.citizenProfile?.phoneNumber,
          cnic:
            payload.cnic !== undefined && payload.cnic !== null && String(payload.cnic).trim() !== ''
              ? String(payload.cnic).trim()
              : user.citizenProfile?.cnic,
          country: payload.country ?? user.citizenProfile?.country,
          city: payload.city ?? user.citizenProfile?.city,
          address: payload.address ?? user.citizenProfile?.address,
          identityDocumentUrls: payload.identityDocumentUrls ?? user.citizenProfile?.identityDocumentUrls ?? [],
        } as any;
        user.markModified('citizenProfile');

        // Check required fields for citizen
        const citizenData = user.citizenProfile as any;
        user.isProfileComplete = !!(
          citizenData?.fullName &&
          citizenData?.phoneNumber &&
          citizenData?.city
        );
        console.log('[CompleteProfile] Citizen profile data:', citizenData);
        console.log('[CompleteProfile] isProfileComplete:', user.isProfileComplete);
      }

      if (user.role === UserRole.LAWYER) {
        // Default availability for weekdays 9AM-5PM
        const defaultAvailability = [
          { day: 'Monday', startTime: '09:00', endTime: '17:00', isAvailable: true },
          { day: 'Tuesday', startTime: '09:00', endTime: '17:00', isAvailable: true },
          { day: 'Wednesday', startTime: '09:00', endTime: '17:00', isAvailable: true },
          { day: 'Thursday', startTime: '09:00', endTime: '17:00', isAvailable: true },
          { day: 'Friday', startTime: '09:00', endTime: '17:00', isAvailable: true },
          { day: 'Saturday', startTime: '09:00', endTime: '17:00', isAvailable: false },
          { day: 'Sunday', startTime: '09:00', endTime: '17:00', isAvailable: false },
        ];

        user.lawyerProfile = {
          ...(user.lawyerProfile || {}),
          fullName: payload.fullName ?? user.lawyerProfile?.fullName,
          phoneNumber: payload.phoneNumber ?? user.lawyerProfile?.phoneNumber,
          cnic:
            payload.cnic !== undefined && payload.cnic !== null && String(payload.cnic).trim() !== ''
              ? String(payload.cnic).trim()
              : user.lawyerProfile?.cnic,
          country: payload.country ?? user.lawyerProfile?.country,
          city: payload.city ?? user.lawyerProfile?.city,
          practiceAreas: payload.practiceAreas ?? user.lawyerProfile?.practiceAreas ?? [],
          yearsOfExperience: payload.yearsOfExperience ?? user.lawyerProfile?.yearsOfExperience,
          barCouncilNumber: payload.barCouncilNumber ?? user.lawyerProfile?.barCouncilNumber,
          officeAddress: payload.officeAddress ?? user.lawyerProfile?.officeAddress,
          bio: payload.bio ?? user.lawyerProfile?.bio,
          verificationDocumentUrls:
            payload.verificationDocumentUrls ?? user.lawyerProfile?.verificationDocumentUrls ?? [],
          verificationStatus: user.lawyerProfile?.verificationStatus ?? null,
          verificationSubmittedAt: user.lawyerProfile?.verificationSubmittedAt,
          // Set default availability if not already set
          availability: (user.lawyerProfile?.availability && user.lawyerProfile.availability.length > 0)
            ? user.lawyerProfile.availability 
            : defaultAvailability,
          consultationFee: payload.consultationFee ?? user.lawyerProfile?.consultationFee ?? 2000,
          consultationDuration: payload.consultationDuration ?? user.lawyerProfile?.consultationDuration ?? 30,
          acceptsOnlineConsultation: payload.acceptsOnlineConsultation ?? user.lawyerProfile?.acceptsOnlineConsultation ?? true,
          acceptsInPersonConsultation: payload.acceptsInPersonConsultation ?? user.lawyerProfile?.acceptsInPersonConsultation ?? true,
        } as any;
        user.markModified('lawyerProfile');

        // Check required fields - use !== undefined for numeric fields
        const profile = user.lawyerProfile as any;
        user.isProfileComplete = !!(
          profile?.fullName &&
          profile?.phoneNumber &&
          profile?.city &&
          profile?.barCouncilNumber &&
          (profile?.yearsOfExperience !== undefined && profile?.yearsOfExperience !== null)
        );
        console.log('[CompleteProfile] Lawyer profile data:', {
          fullName: profile?.fullName,
          phoneNumber: profile?.phoneNumber,
          city: profile?.city,
          barCouncilNumber: profile?.barCouncilNumber,
          yearsOfExperience: profile?.yearsOfExperience,
        });
        console.log('[CompleteProfile] isProfileComplete:', user.isProfileComplete);
      }

      await user.save();

      // UC-07: Notify admins when lawyer submits verification documents (after save)
      if (user.role === UserRole.LAWYER) {
        const docs = user.lawyerProfile?.verificationDocumentUrls;
        const status = (user.lawyerProfile as any)?.verificationStatus;
        if (docs?.length && status === 'pending') {
          this.notificationService
            .notifyAdmins(
              'New verification request',
              'A lawyer has submitted documents for verification. Please review.',
              '/admin/verifications',
            )
            .catch(() => {});
        }
      }

      return {
        success: true,
        message: 'Profile saved successfully',
        user: {
          _id: user._id,
          email: user.email,
          role: user.role,
          emailVerified: user.emailVerified,
          isProfileComplete: user.isProfileComplete,
          citizenProfile: user.citizenProfile ?? null,
          lawyerProfile: user.lawyerProfile ?? null,
          paymentInfo: user.paymentInfo ?? null,
        },
      };
    } catch (error) {
      throw new HttpException(
        (error as any)?.message || 'Something went wrong',
        (error as any)?.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // -------------------------
  // Password Reset Methods
  // -------------------------
  async sendPasswordResetCode(email: string) {
    const normalizedEmail = this.normalizeEmail(email);
    const user = await this.userModel.findOne({ email: normalizedEmail });

    if (!user) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }
    if (user.role === UserRole.ADMIN) {
      throw new HttpException('Admin password reset via email is disabled', HttpStatus.BAD_REQUEST);
    }

    const resetCode = this.generateCode();
    const resetCodeExpiry = new Date(Date.now() + this.otpTtlMs);

    user.passwordResetCode = this.hashCode(resetCode);
    user.passwordResetExpiry = resetCodeExpiry;
    await user.save();

    await this.emailService.sendPasswordResetEmail(user.email, resetCode);

    return {
      success: true,
      message: 'Password reset code sent to email.',
    };
  }

 // Method to verify the password reset code
async verifyPasswordResetCode(email: string, code: string) {
  const normalizedEmail = this.normalizeEmail(email);
  const user = await this.userModel.findOne({ email: normalizedEmail });

  const hashed = this.hashCode(code);
  if (!user || user.role === UserRole.ADMIN || user.passwordResetCode !== hashed || !user.passwordResetExpiry || new Date() > user.passwordResetExpiry) {
    throw new HttpException('Invalid or expired reset code', HttpStatus.BAD_REQUEST);
  }

  return { success: true, message: 'Reset code verified successfully' };
}

// Method to reset the password with the reset code
async resetPasswordWithCode(email: string, code: string, newPassword: string) {
  const normalizedEmail = this.normalizeEmail(email);
  const user = await this.userModel.findOne({ email: normalizedEmail });

  const hashed = this.hashCode(code);
  if (!user || user.role === UserRole.ADMIN || user.passwordResetCode !== hashed || !user.passwordResetExpiry || new Date() > user.passwordResetExpiry) {
    throw new HttpException('Invalid or expired reset code', HttpStatus.BAD_REQUEST);
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10);
  user.password = hashedPassword;
  user.passwordResetCode = null;
  user.passwordResetExpiry = null;
  await user.save();

  return { success: true, message: 'Password reset successfully' };
}

  // -------------------------
  // Change Password
  // -------------------------
  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }

    const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isPasswordValid) {
      throw new HttpException('Invalid current password', HttpStatus.BAD_REQUEST);
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    await user.save();

    return { success: true, message: 'Password changed successfully' };
  }

  // -------------------------
  // Logout Method
  // -------------------------
  async logout(userId: string, res: Response) {
    // For logout, you typically clear the access token or session cookie.
    res.clearCookie('access_token');
    return { success: true, message: 'Logged out successfully' };
  }

 
}
