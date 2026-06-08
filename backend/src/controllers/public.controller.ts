import {
  Body,
  Controller,
  Get,
  Post,
  HttpException,
  HttpStatus,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PublicService } from '../services/public.service';
import { AiLegalService } from '../services/ai-legal.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '../auth/auth.guard';

@ApiTags('Public')
@Controller('public')
export class PublicController {
  constructor(
    private readonly publicService: PublicService,
    private readonly aiLegalService: AiLegalService,
  ) {}

  @Get('stats')
  @ApiOperation({ summary: 'Homepage and marketing statistics (no auth)' })
  async getStats() {
    return this.publicService.getPublicStats();
  }

  @Post('contact')
  @ApiOperation({ summary: 'Public contact form (no auth)' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['name', 'email', 'subject', 'message'],
      properties: {
        name: { type: 'string' },
        email: { type: 'string' },
        subject: { type: 'string' },
        message: { type: 'string' },
      },
    },
  })
  async contact(
    @Body() body: { name: string; email: string; subject: string; message: string },
  ) {
    return this.publicService.submitContactInquiry(body.name, body.email, body.subject, body.message);
  }

  @Post('ai/legal-chat')
  @ApiConsumes('multipart/form-data', 'application/json')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Legal guidance assistant — single chatbot entry point (optional document upload)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        language: { type: 'string', enum: ['english', 'urdu', 'roman_urdu'] },
        location: { type: 'string' },
        latitude: { type: 'number' },
        longitude: { type: 'number' },
        maxBudget: { type: 'number' },
        preferredPracticeArea: { type: 'string' },
        caseText: { type: 'string' },
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  async legalChat(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() req,
    @Body() body: {
      message?: string;
      language?: 'english' | 'urdu' | 'roman_urdu';
        location?: string;
        latitude?: number;
        longitude?: number;
        maxBudget?: number;
        preferredPracticeArea?: string;
      caseText?: string;
    },
  ) {
    if (!file && !String(body?.message || body?.caseText || '').trim()) {
      throw new HttpException('message, caseText, or file is required', HttpStatus.BAD_REQUEST);
    }
    return this.aiLegalService.handleLegalChat(body, req?.user?.userId, file);
  }

  @Get('ai/legal-chat/history')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get legal chat history for current user' })
  async legalChatHistory(@Req() req) {
    return this.aiLegalService.getHistoryForUser(req.user.userId);
  }
}
