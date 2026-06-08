import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { OnEvent } from '@nestjs/event-emitter';
import * as jwt from 'jsonwebtoken';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ChatService } from '../services/chat.service';
import { User, UserDocument, UserRole } from '../schemas/user.schema';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  userEmail?: string;
}

function requireJwtSecret(): string {
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret) {
    throw new Error('JWT_SECRET is required for chat authentication');
  }
  return secret;
}

function resolveSocketCorsOrigins(): string[] {
  const isProd = process.env.NODE_ENV === 'production';
  const explicit = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const devExtras = (process.env.CORS_DEV_ORIGINS || 'http://localhost:5173,http://localhost:3000')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const fe = (process.env.FRONTEND_URL || '').replace(/\/$/, '');

  if (explicit.length) {
    return isProd ? Array.from(new Set(explicit)) : Array.from(new Set([...explicit, ...devExtras]));
  }
  if (isProd) {
    if (fe) return [fe];
    throw new Error('Socket CORS: set CORS_ORIGINS (comma-separated) or FRONTEND_URL in production');
  }
  return devExtras;
}

@WebSocketGateway({
  cors: {
    origin: resolveSocketCorsOrigins(),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  },
  namespace: '/chat',
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  // Map userId to socket IDs (a user can have multiple connections)
  private userSockets: Map<string, Set<string>> = new Map();

  constructor(
    private chatService: ChatService,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  // Handle new connection
  async handleConnection(socket: AuthenticatedSocket) {
    try {
      // Get token from handshake
      const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.split(' ')[1];

      if (!token) {
        socket.emit('error', { message: 'Authentication required' });
        socket.disconnect();
        return;
      }

      // Verify token
      const decoded = jwt.verify(token, requireJwtSecret()) as any;
      const user = await this.userModel
        .findById(decoded.userId)
        .select('role isProfileComplete citizenProfile.kycReview')
        .lean()
        .exec();
      if (!user) {
        socket.emit('error', { message: 'User not found' });
        socket.disconnect();
        return;
      }
      if (user.role === UserRole.CITIZEN) {
        const kyc = user.citizenProfile?.kycReview;
        const ready = !!(user.isProfileComplete && kyc?.ocrMatched && kyc?.faceMatchPassed);
        if (!ready) {
          socket.emit('error', {
            message: 'Complete profile and CNIC identity verification before using chat.',
          });
          socket.disconnect();
          return;
        }
      }
      socket.userId = decoded.userId;
      socket.userEmail = decoded.email;

      // Add socket to user's socket set
      if (!this.userSockets.has(decoded.userId)) {
        this.userSockets.set(decoded.userId, new Set());
      }
      this.userSockets.get(decoded.userId)!.add(socket.id);

      // Join user's personal room for direct notifications
      socket.join(`user:${decoded.userId}`);

      // Notify user's contacts that they're online
      this.broadcastUserStatus(decoded.userId, 'online');

      console.log(`User ${decoded.userId} connected via socket ${socket.id}`);
    } catch (error) {
      socket.emit('error', { message: 'Invalid token' });
      socket.disconnect();
    }
  }

  // Handle disconnection
  handleDisconnect(socket: AuthenticatedSocket) {
    if (socket.userId) {
      const userSocketSet = this.userSockets.get(socket.userId);
      if (userSocketSet) {
        userSocketSet.delete(socket.id);
        if (userSocketSet.size === 0) {
          this.userSockets.delete(socket.userId);
          // User is fully offline
          this.broadcastUserStatus(socket.userId, 'offline');
        }
      }
      console.log(`User ${socket.userId} disconnected from socket ${socket.id}`);
    }
  }

  // Send message
  @SubscribeMessage('sendMessage')
  async handleSendMessage(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() data: { receiverId: string; content?: string; attachments?: any[] },
  ) {
    if (!socket.userId) {
      return { error: 'Not authenticated' };
    }

    try {
      const result = await this.chatService.sendMessage(
        socket.userId,
        data.receiverId,
        data.content,
        data.attachments,
      );

      // Emit to receiver's room
      this.server.to(`user:${data.receiverId}`).emit('newMessage', result.data);

      return { success: true, data: result.data };
    } catch (error: any) {
      const response = error?.response;
      const message =
        typeof response === 'string'
          ? response
          : response?.message || error?.message || 'Failed to send message';
      const code = typeof response === 'object' ? response?.code : undefined;
      return { error: message, code };
    }
  }

  // Join conversation room
  @SubscribeMessage('joinConversation')
  async handleJoinConversation(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() data: { conversationId: string },
  ) {
    if (!socket.userId) {
      return { error: 'Not authenticated' };
    }

    socket.join(`conversation:${data.conversationId}`);
    
    // Mark messages as read
    await this.chatService.markMessagesAsRead(data.conversationId, socket.userId);

    return { success: true };
  }

  // Leave conversation room
  @SubscribeMessage('leaveConversation')
  handleLeaveConversation(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() data: { conversationId: string },
  ) {
    socket.leave(`conversation:${data.conversationId}`);
    return { success: true };
  }

  // Typing indicator
  @SubscribeMessage('typing')
  handleTyping(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() data: { conversationId: string; isTyping: boolean },
  ) {
    if (!socket.userId) return;

    socket.to(`conversation:${data.conversationId}`).emit('userTyping', {
      userId: socket.userId,
      conversationId: data.conversationId,
      isTyping: data.isTyping,
    });
  }

  // Mark messages as read
  @SubscribeMessage('markRead')
  async handleMarkRead(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() data: { conversationId: string },
  ) {
    if (!socket.userId) {
      return { error: 'Not authenticated' };
    }

    await this.chatService.markMessagesAsRead(data.conversationId, socket.userId);

    // Notify other participant
    socket.to(`conversation:${data.conversationId}`).emit('messagesRead', {
      conversationId: data.conversationId,
      readBy: socket.userId,
    });

    return { success: true };
  }

  // Get online status
  @SubscribeMessage('getOnlineStatus')
  handleGetOnlineStatus(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() data: { userIds: string[] },
  ) {
    if (!socket.userId) {
      return { error: 'Not authenticated' };
    }
    const uniqueUserIds = Array.from(new Set((data.userIds || []).filter((v) => typeof v === 'string'))).slice(0, 100);
    const statuses: Record<string, boolean> = {};

    uniqueUserIds.forEach((userId) => {
      statuses[userId] = this.userSockets.has(userId);
    });

    return { success: true, statuses };
  }

  // Broadcast user status to their contacts
  private broadcastUserStatus(userId: string, status: 'online' | 'offline') {
    // Do not broadcast global presence to all users.
    this.server.to(`user:${userId}`).emit('userStatus', { userId, status });
  }

  // Listen for notification events from NotificationService
  @OnEvent('notification.created')
  handleNotificationCreated(payload: { userId: string; notification: any }) {
    // Send notification to user's room
    this.server.to(`user:${payload.userId}`).emit('notification', payload.notification);
  }

  // Utility method to check if user is online
  isUserOnline(userId: string): boolean {
    return this.userSockets.has(userId) && this.userSockets.get(userId)!.size > 0;
  }

  // Utility method to send to specific user
  sendToUser(userId: string, event: string, data: any) {
    this.server.to(`user:${userId}`).emit(event, data);
  }
}
