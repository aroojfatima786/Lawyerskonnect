import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  Req,
  UseInterceptors,
  UploadedFile,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { ChatService } from '../services/chat.service';
import { AuthGuard } from '../auth/auth.guard';
import { CitizenKycGuard } from '../auth/citizen-kyc.guard';

const CHAT_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;

@ApiTags('Chat')
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get('conversations')
  @UseGuards(AuthGuard, CitizenKycGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get user conversations list' })
  async getConversations(@Req() req) {
    return this.chatService.getUserConversations(req.user.userId);
  }

  @Get('conversations/:conversationId/messages')
  @UseGuards(AuthGuard, CitizenKycGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get messages in a conversation' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getMessages(
    @Req() req,
    @Param('conversationId') conversationId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.chatService.getConversationMessages(
      conversationId,
      req.user.userId,
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 50,
    );
  }

  @Post('upload-attachment')
  @UseGuards(AuthGuard, CitizenKycGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Upload a chat attachment (validated; does not send message)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        receiverId: { type: 'string' },
      },
      required: ['file', 'receiverId'],
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: CHAT_ATTACHMENT_MAX_BYTES },
    }),
  )
  async uploadAttachment(
    @Req() req,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { receiverId: string },
  ) {
    if (!file) {
      throw new HttpException('No file uploaded', HttpStatus.BAD_REQUEST);
    }
    if (!body?.receiverId?.trim()) {
      throw new HttpException('receiverId is required', HttpStatus.BAD_REQUEST);
    }
    return this.chatService.uploadChatAttachment(req.user.userId, body.receiverId.trim(), file);
  }

  @Post('send')
  @UseGuards(AuthGuard, CitizenKycGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Send a message' })
  async sendMessage(
    @Req() req,
    @Body() body: {
      receiverId: string;
      content?: string;
      attachments?: any[];
    },
  ) {
    return this.chatService.sendMessage(
      req.user.userId,
      body.receiverId,
      body.content,
      body.attachments,
    );
  }

  @Post('conversations/:conversationId/read')
  @UseGuards(AuthGuard, CitizenKycGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mark messages as read' })
  async markAsRead(@Req() req, @Param('conversationId') conversationId: string) {
    return this.chatService.markMessagesAsRead(conversationId, req.user.userId);
  }

  @Get('unread-count')
  @UseGuards(AuthGuard, CitizenKycGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get unread messages count' })
  async getUnreadCount(@Req() req) {
    return this.chatService.getUnreadCount(req.user.userId);
  }

  @Delete('conversations/:conversationId/hide')
  @UseGuards(AuthGuard, CitizenKycGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Hide conversation from your list (does not delete messages)' })
  async hideConversation(@Req() req, @Param('conversationId') conversationId: string) {
    return this.chatService.hideConversationForUser(conversationId, req.user.userId);
  }

  @Delete('messages/:id')
  @UseGuards(AuthGuard, CitizenKycGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a message' })
  async deleteMessage(@Req() req, @Param('id') id: string) {
    return this.chatService.deleteMessage(id, req.user.userId);
  }

  @Patch('messages/:id')
  @UseGuards(AuthGuard, CitizenKycGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Edit a message you sent' })
  async editMessage(@Req() req, @Param('id') id: string, @Body() body: { content?: string }) {
    return this.chatService.editMessage(id, req.user.userId, body?.content ?? '');
  }

  @Get('conversation-with/:userId')
  @UseGuards(AuthGuard, CitizenKycGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get or check conversation with another user' })
  async getConversationWithUser(@Req() req, @Param('userId') userId: string) {
    return this.chatService.getConversationByUsers(req.user.userId, userId);
  }
}
