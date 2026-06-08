import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
  UseInterceptors,
  UploadedFile,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { IdentityService } from '../services/identity.service';
import { DocumentType } from '../schemas/identity.schema';
import { StorageService } from '../services/storage.service';
import { UserRole } from '../schemas/user.schema';
import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { RequestRateLimiter } from '../common/request-rate-limiter';

class UploadIdentityDto {
  @IsString()
  @IsIn(['cnic', 'cnic_front', 'cnic_back', 'selfie', 'live_selfie', 'bar_certificate', 'license', 'degree', 'other'])
  documentType: string;
}

class AutomatedCheckDto {
  @IsOptional()
  @Matches(/^[0-9-]{13,15}$/)
  cnic?: string;
}

class ReviewVerificationDto {
  @IsIn(['approve', 'reject'])
  action: 'approve' | 'reject';

  @IsOptional()
  @IsString()
  @MaxLength(300)
  rejectionReason?: string;
}

@ApiTags('Identity Verification')
@Controller('identity')
export class IdentityController {
  constructor(
    private readonly identityService: IdentityService,
    private readonly storageService: StorageService,
  ) {}

  private enforceRateLimit(key: string, limit: number, windowMs: number) {
    if (!RequestRateLimiter.consume(key, limit, windowMs)) {
      throw new HttpException('Too many requests. Please try again later.', HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  private normalizeDocumentType(raw: string): DocumentType | null {
    const v = String(raw || '')
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, '_');
    if (v === 'cnic' || v === 'cnic_front') return DocumentType.CNIC_FRONT;
    if (v === 'cnic_back') return DocumentType.CNIC_BACK;
    if (v === 'selfie' || v === 'live_selfie') return DocumentType.SELFIE;
    if (v === 'bar_certificate' || v === 'barcouncilcertificate') return DocumentType.BAR_CERTIFICATE;
    if (v === 'license') return DocumentType.LICENSE;
    if (v === 'degree') return DocumentType.DEGREE;
    if (v === 'other') return DocumentType.OTHER;
    return null;
  }

  @Post('upload')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Upload a verification document' })
  @ApiConsumes('multipart/form-data')
  @UseGuards(AuthGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const extOk = /\.(pdf|jpg|jpeg|png|webp)$/i.test(file.originalname || '');
        const mimeOk = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg', 'image/webp'].includes(
          file.mimetype || '',
        );
        if (extOk || mimeOk) cb(null, true);
        else cb(new HttpException('Only PDF, JPG, PNG, WEBP allowed', HttpStatus.BAD_REQUEST), false);
      },
    }),
  )
  async uploadDocument(
    @Req() req: any,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: UploadIdentityDto,
  ) {
    if (!file) {
      throw new HttpException('No file uploaded', HttpStatus.BAD_REQUEST);
    }

    const userId = req.user.userId;
    const documentType = this.normalizeDocumentType(body.documentType);
    if (!documentType) {
      throw new HttpException('Invalid document type', HttpStatus.BAD_REQUEST);
    }

    if (this.identityService.isImageOnlyDocumentType(documentType)) {
      const isImage =
        /^image\//.test(file.mimetype || '') || /\.(jpg|jpeg|png|webp)$/i.test(file.originalname || '');
      if (!isImage) {
        throw new HttpException('CNIC and selfie uploads must be image files (JPG/PNG)', HttpStatus.BAD_REQUEST);
      }
    }

    const uploaded = await this.storageService.uploadDocument(file, {
      subFolder: 'verification',
      resourceType: 'auto',
    });

    return this.identityService.uploadDocument(userId, documentType, {
      fileUrl: uploaded.url,
      filename: uploaded.filename,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      cloudinaryPublicId: uploaded.cloudinaryPublicId,
      secureUrl: uploaded.secureUrl,
    });
  }

  @Get('my-documents')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  async getMyDocuments(@Req() req: any) {
    return this.identityService.getUserDocuments(req.user.userId);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  async deleteDocument(@Req() req: any, @Param('id') documentId: string) {
    return this.identityService.deleteDocument(req.user.userId, documentId);
  }

  @Post('automated-check')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  async runAutomatedCheck(@Req() req: any, @Body() body: AutomatedCheckDto) {
    this.enforceRateLimit(`kyc:auto:${req.user.userId}`, 10, 60_000);
    return this.identityService.runAutomatedKycCheck(req.user.userId, body?.cnic);
  }

  @Post('submit')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  async submitVerification(@Req() req: any) {
    return this.identityService.submitVerificationRequest(req.user.userId);
  }

  @Get('admin/verification-requests')
  @ApiBearerAuth()
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async getPendingVerifications(@Req() req: any) {
    return this.identityService.getPendingVerifications();
  }

  @Post('admin/review/:userId')
  @ApiBearerAuth()
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async reviewVerification(
    @Req() req: any,
    @Param('userId') userId: string,
    @Body() body: ReviewVerificationDto,
  ) {
    this.enforceRateLimit(`kyc:admin-review:${req.user.userId}`, 30, 60_000);
    if (body.action === 'reject' && !body.rejectionReason?.trim()) {
      throw new HttpException('Rejection reason is required', HttpStatus.BAD_REQUEST);
    }
    return this.identityService.reviewVerification(
      userId,
      req.user.userId,
      body.action,
      body.rejectionReason,
    );
  }
}
