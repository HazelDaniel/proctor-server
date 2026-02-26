import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { AuthService } from 'src/auth/auth.service';
import { ToolInstanceService } from 'src/toolinstance/toolinstance.service';
import { ChatService } from './chat.service';
import * as cookie from 'src/common/utils/cookie';

/**
 * Dedicated SocketIO gateway for real-time chat.
 * Namespace: /chat
 */
@WebSocketGateway({
  namespace: '/chat',
  cors: {
    origin: 'http://localhost:5173',
    credentials: true,
  },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(ChatGateway.name);

  // Note: We use the tool instance's document ID or instance ID as the room name.
  // Using instanceId directly is easier for chat.

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly authService: AuthService,
    private readonly toolInstanceService: ToolInstanceService,
    private readonly chatService: ChatService,
  ) {}

  private instanceRoom(instanceId: string) {
    return `instance:${instanceId}`;
  }

  async handleConnection(client: Socket) {
    let token = String(client.handshake.auth?.token ?? '');
    
    // Fallback: try to read access_token from cookie
    if (!token && client.handshake.headers.cookie) {
      const parsedCookies = cookie.parse(client.handshake.headers.cookie);
      if (parsedCookies.access_token) {
        token = parsedCookies.access_token;
      }
    }
    
    const instanceId = String(client.handshake.query?.instanceId ?? '');

    if (!token || !instanceId) {
      client.disconnect(true);
      return;
    }

    try {
      const { userId } = await this.authService.verifyToken(token);
      
      // Verify access to the instance
      const canAccess = await this.toolInstanceService.canAccess(instanceId, userId);
      if (!canAccess) {
        client.disconnect(true);
        return;
      }

      (client as any).data = { userId, instanceId };
      await client.join(this.instanceRoom(instanceId));
      this.logger.debug(`Chat client connected: user=${userId} instance=${instanceId}`);
    } catch {
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: Socket) {
    const userId = (client as any).data?.userId;
    const instanceId = (client as any).data?.instanceId;
    if (userId && instanceId) {
      this.logger.debug(`Chat client disconnected: user=${userId} instance=${instanceId}`);
    }
  }

  @SubscribeMessage('sendMessage')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { content: string; type?: string; metadata?: any },
  ) {
    const userId = (client as any).data?.userId;
    const instanceId = (client as any).data?.instanceId;

    if (!userId || !instanceId || !data.content) return;

    // Persist and broadcast
    await this.chatService.createMessage(
      instanceId,
      userId,
      data.content,
      data.type,
      data.metadata,
    );
  }

  emitToInstance(instanceId: string, message: any) {
    this.server.to(this.instanceRoom(instanceId)).emit('chatMessage', message);
  }
}
