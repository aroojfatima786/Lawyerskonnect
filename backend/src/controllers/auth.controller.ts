import { Body, Controller, Post, Get, UseGuards, Req, Res, Patch, HttpException, HttpStatus, UseInterceptors, UploadedFile, Query } from '@nestjs/common';
import type { Request, Response } from 'express';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { User, UserDocument, UserRole } from '../schemas/user.schema';
import { AuthService } from '../services/auth.service';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { StorageService } from '../services/storage.service';
import { IsEmail, IsIn, IsOptional, IsString, Length, MinLength, Matches, IsBoolean } from 'class-validator';
import { RequestRateLimiter } from '../common/request-rate-limiter';

class SigninDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;
}

class SignupDto extends SigninDto {}

class VerifyOtpDto {
  @IsEmail()
  email: string;

  @Matches(/^\d{6}$/)
  code: string;

  @IsOptional()
  @IsIn(['citizen', 'lawyer'])
  role?: string;
}

class ResendOtpDto {
  @IsEmail()
  email: string;

  @IsOptional()
  @IsIn(['citizen', 'lawyer'])
  role?: string;
}

class VerifyEmailDto {
  @Matches(/^\d{6}$/)
  code: string;

  @IsOptional()
  @IsString()
  userId?: string;
}

class ResendVerificationDto {
  @IsString()
  userId: string;
}

class ForgotPasswordDto {
  @IsEmail()
  email: string;
}

class VerifyResetDto {
  @IsEmail()
  email: string;

  @Matches(/^\d{6}$/)
  code: string;
}

class ResetPasswordDto extends VerifyResetDto {
  @IsString()
  @MinLength(8)
  newPassword: string;
}

class ChangePasswordDto {
  @IsString()
  @MinLength(8)
  currentPassword: string;

  @IsString()
  @MinLength(8)
  newPassword: string;
}

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  private isMultiSessionTestMode() {
    return process.env.AUTH_MODE === 'multisession_test';
  }

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private readonly authService: AuthService,
    private readonly storageService: StorageService,
  ) {}

  // ============================================================
  // GET CURRENT USER
  // ============================================================
  @Get('me')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current authenticated user' })
  async getCurrentUser(@Req() req) {
    const user = await this.userModel
      .findById(req.user.userId)
      .select('-password -verificationCode -verificationCodeExpiry -loginOtpCode -loginOtpExpiry -passwordResetCode -passwordResetExpiry');
    
    if (!user) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }

    return {
      success: true,
      data: user,
    };
  }

  // -----------------------------
  // Helpers
  // -----------------------------
  private setAccessTokenCookie(res: Response, token: string) {
    if (this.isMultiSessionTestMode()) {
      return;
    }
    const cookieOptions: any = {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000,
      path: '/',
    };

    if (process.env.NODE_ENV === 'production' && process.env.COOKIE_DOMAIN) {
      cookieOptions.domain = process.env.COOKIE_DOMAIN;
    }

    res.cookie('access_token', token, cookieOptions);
  }

  private enforceRateLimit(req: Request, scope: string, limit: number, windowMs: number) {
    const ip = req.ip || (req.headers['x-forwarded-for'] as string) || 'unknown';
    const key = `${scope}:${ip}`;
    if (!RequestRateLimiter.consume(key, limit, windowMs)) {
      throw new HttpException('Too many requests. Please try again later.', HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  // ============================================================
  // SIGNUP - CITIZEN (default)
  // ============================================================
  @Post('signup')
  @ApiOperation({
    summary: 'Sign up (default citizen)',
    description:
      'Register a new user with email and password. Default role = citizen. Returns userId and sends verification code to email.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        email: { type: 'string', format: 'email', example: 'user@example.com' },
        password: { type: 'string', example: 'YourSecurePassword123!' },
      },
      required: ['email', 'password'],
    },
  })
  async signup(@Body() body: SignupDto) {
    return this.authService.signup(body.email, body.password, UserRole.CITIZEN);
  }

  // ============================================================
  // SIGNUP - LAWYER
  // ============================================================
  @Post('lawyer/signup')
  @ApiOperation({
    summary: 'Sign up as Lawyer',
    description: 'Register a new lawyer account. Returns userId and sends verification code to email.',
  })
  async lawyerSignup(@Body() body: SignupDto) {
    return this.authService.signup(body.email, body.password, UserRole.LAWYER);
  }

  // ============================================================
  // GOOGLE OAUTH REDIRECT
  // ============================================================
  @Get('google')
  @ApiOperation({ summary: 'Start Google OAuth login' })
  @ApiQuery({ name: 'role', required: false, enum: ['citizen', 'lawyer'] })
  async googleAuth(@Res() res: Response, @Query('role') role?: string) {
    const safeRole = role === UserRole.LAWYER ? UserRole.LAWYER : UserRole.CITIZEN;
    const googleUrl = await this.authService.getGoogleAuthUrl(safeRole);
    return res.redirect(googleUrl);
  }

  @Get('google/callback')
  @ApiOperation({ summary: 'Google OAuth callback' })
  @ApiQuery({ name: 'code', required: true })
  @ApiQuery({ name: 'state', required: false })
  async googleCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    if (!code || code.length < 10) {
      throw new HttpException('Invalid OAuth callback', HttpStatus.BAD_REQUEST);
    }
    const requestedRole = state === UserRole.LAWYER ? UserRole.LAWYER : UserRole.CITIZEN;
    const result: any = await this.authService.signInWithGoogleCode(code, requestedRole);

    if (result?.token) {
      this.setAccessTokenCookie(res, result.token);
    }

    const frontendBase = process.env.FRONTEND_URL?.trim() || (process.env.NODE_ENV !== 'production' ? 'http://localhost:5173' : '');
    if (!frontendBase) {
      throw new HttpException('FRONTEND_URL is required in production for OAuth redirect', HttpStatus.INTERNAL_SERVER_ERROR);
    }
    const redirectUrl = `${frontendBase.replace(/\/$/, '')}/auth/google/callback?token=${encodeURIComponent(
      result.token,
    )}&user=${encodeURIComponent(JSON.stringify(result.user))}`;
    return res.redirect(redirectUrl);
  }

  // ============================================================
  // SIGNIN - CITIZEN
  // ============================================================
  @Post('citizen/signin')
  @ApiOperation({ summary: 'Citizen sign in' })
  async citizenSignin(
    @Req() req: Request,
    @Body() body: SigninDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.enforceRateLimit(req, 'auth:signin', 10, 60_000);
    const result: any = await this.authService.signinInit(body.email, body.password, UserRole.CITIZEN);

    // If skipOtp is true, token is returned directly
    if (result?.token) {
      this.setAccessTokenCookie(res, result.token);
      return {
        success: true,
        message: 'Signed in successfully',
        token: result.token,
        user: result.user,
        skipOtp: true,
      };
    }

    // Otherwise, OTP was sent
    return result;
  }

  // ============================================================
  // SIGNIN - LAWYER
  // ============================================================
  @Post('lawyer/signin')
  @ApiOperation({ summary: 'Lawyer sign in' })
  async lawyerSignin(
    @Req() req: Request,
    @Body() body: SigninDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.enforceRateLimit(req, 'auth:signin', 10, 60_000);
    const result: any = await this.authService.signinInit(body.email, body.password, UserRole.LAWYER);

    if (result?.token) {
      this.setAccessTokenCookie(res, result.token);
      return {
        success: true,
        message: 'Signed in successfully',
        token: result.token,
        user: result.user,
        skipOtp: true,
      };
    }

    return result;
  }

  // ============================================================
  // VERIFY SIGNIN OTP
  // ============================================================
  @Post('verify-otp')
  @ApiOperation({ summary: 'Verify signin OTP' })
  async verifySigninOtp(
    @Req() req: Request,
    @Body() body: VerifyOtpDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.enforceRateLimit(req, 'auth:verify-otp', 10, 60_000);
    const role = body.role === 'lawyer' ? UserRole.LAWYER : UserRole.CITIZEN;
    const result: any = await this.authService.verifySigninOtp(body.email, body.code, role);

    if (result?.token) {
      this.setAccessTokenCookie(res, result.token);
    }

    return result;
  }

  // ============================================================
  // RESEND SIGNIN OTP
  // ============================================================
  @Post('resend-otp')
  @ApiOperation({ summary: 'Resend signin OTP' })
  async resendSigninOtp(@Req() req: Request, @Body() body: ResendOtpDto) {
    this.enforceRateLimit(req, 'auth:resend-otp', 6, 60_000);
    const role = body.role === 'lawyer' ? UserRole.LAWYER : UserRole.CITIZEN;
    return this.authService.resendSigninOtp(body.email, role);
  }

  // Commenting out any email verification/resend code
  // @Post('resend-code')
  // @ApiOperation({ summary: 'Resend verification code' })
  // async resendCode(@Body() body: { userId: string }) {
  //   return this.authService.resendVerificationCode(body.userId);
  // }

  // ============================================================
  // VERIFY EMAIL
  // ============================================================
  @Post('verify-email')
  @ApiOperation({
    summary: 'Verify email address',
    description: 'Verify user email with the 6-digit code received during signup',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        code: { type: 'string', example: '123456' },
        userId: { type: 'string', example: '507f1f77bcf86cd799439011' },
      },
      required: ['code'],
    },
  })
  async verifyEmail(@Body() body: VerifyEmailDto) {
    return this.authService.verifyEmail(body.code, body.userId);
  }

  @Post('resend-verification')
  @ApiOperation({ summary: 'Resend email verification code' })
  async resendVerification(@Req() req: Request, @Body() body: ResendVerificationDto) {
    this.enforceRateLimit(req, 'auth:resend-verification', 5, 60_000);
    return this.authService.resendVerificationCode(body.userId);
  }
  

  // Resend OTP (commented out due to email functionality removal)
  // @Post('signin/resend-otp')
  // @ApiOperation({ summary: 'Resend signin OTP' })
  // async resendSigninOtp(@Body() body: { email: string }) {
  //   return this.authService.resendSigninOtp(body.email);
  // }

  // ============================================================
  // COMPLETE PROFILE
  // ============================================================
  @Post('complete-profile')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Complete profile (Citizen/Lawyer)',
    description:
      'After login, user fills profile fields. Citizen: CNIC/contact/payment. Lawyer: bar council/docs/payment.',
  })
  async completeProfile(@Req() req, @Body() body: any) {
    return this.authService.completeProfile(req.user.userId, body);
  }

  // ============================================================
  // UPLOAD VERIFICATION DOCUMENT (Lawyer) — legacy; prefer POST /identity/upload
  // ============================================================
  @Post('upload-verification-document')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Upload a verification document (PDF/image)' })
  @UseGuards(AuthGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
      fileFilter: (_req, file, cb) => {
        const extOk = /\.(pdf|jpg|jpeg|png)$/i.test(file.originalname || '');
        const mimeOk = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'].includes(file.mimetype || '');
        if (extOk || mimeOk) cb(null, true);
        else cb(new HttpException('Only PDF, JPG, PNG allowed', HttpStatus.BAD_REQUEST), false);
      },
    }),
  )
  async uploadVerificationDocument(@Req() req, @UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new HttpException('No file uploaded', HttpStatus.BAD_REQUEST);
    }
    const uploaded = await this.storageService.uploadDocument(file, {
      subFolder: 'verification',
      resourceType: 'auto',
    });
    return {
      success: true,
      url: uploaded.url,
      filename: uploaded.filename,
      secureUrl: uploaded.secureUrl || uploaded.url,
      cloudinaryPublicId: uploaded.cloudinaryPublicId,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      uploadedAt: new Date(),
    };
  }

  // ============================================================
  // PASSWORD RESET
  // ============================================================
  @Post('forgot-password')
  @ApiOperation({ summary: 'Request password reset code' })
  async forgotPassword(@Req() req: Request, @Body() body: ForgotPasswordDto) {
    this.enforceRateLimit(req, 'auth:forgot-password', 5, 60_000);
    return this.authService.sendPasswordResetCode(body.email);
  }

  @Post('verify-reset-code')
  @ApiOperation({ summary: 'Verify password reset code' })
  async verifyResetCode(@Req() req: Request, @Body() body: VerifyResetDto) {
    this.enforceRateLimit(req, 'auth:verify-reset-code', 8, 60_000);
    return this.authService.verifyPasswordResetCode(body.email, body.code);
  }

  @Post('reset-password')
  @ApiOperation({ summary: 'Reset password with verified code' })
  async resetPassword(@Req() req: Request, @Body() body: ResetPasswordDto) {
    this.enforceRateLimit(req, 'auth:reset-password', 5, 60_000);
    return this.authService.resetPasswordWithCode(body.email, body.code, body.newPassword);
  }

  @UseGuards(AuthGuard)
  @Patch('change-password')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change password using current password' })
  async changePassword(
    @Req() req,
    @Body() body: ChangePasswordDto,
  ) {
    return this.authService.changePassword(req.user.userId, body.currentPassword, body.newPassword);
  }

  // ============================================================
  // ADMIN SIGNIN (no OTP required)
  // ============================================================
  @Post('admin/signin')
  @ApiOperation({ summary: 'Admin sign in' })
  async adminSignin(
    @Body() body: SigninDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result: any = await this.authService.signin(body.email, body.password, UserRole.ADMIN);

    if (result?.token) this.setAccessTokenCookie(res, result.token);

    return {
      success: true,
      message: 'Signed in successfully',
      token: result.token,
      user: result.user,
      skipOtp: true, // Admin doesn't need OTP
    };
  }

  // ============================================================
  // LOGOUT
  // ============================================================
  @Post('logout')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout user' })
  async logout(@Req() req, @Res({ passthrough: true }) res: Response) {
    return this.authService.logout(req.user.userId, res);
  }
}
