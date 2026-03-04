import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { AuthService } from 'src/auth/auth.service';
import * as cookie from 'src/common/utils/cookie';

/**
 * Dedicated SocketIO gateway for pushing notifications to connected users.
 * Namespace: /notifications
 *
 * On connection the client provides an auth token in handshake.auth.token.
 * The gateway verifies the token and joins the socket to a user-specific room.
 * Notifications are pushed server→client only; no client→server messages.
 */
@WebSocketGateway({
  namespace: '/notifications',
  cors: {
    origin: ['http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173'],
    credentials: true,
  },
})
export class NotificationGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(NotificationGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(private readonly authService: AuthService) {}

  private userRoom(userId: string) {
    return `user:${userId}`;
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

    if (!token) {
      client.disconnect(true);
      return;
    }

    try {
      const { userId } = await this.authService.verifyToken(token);
      (client as any).data = { userId };
      await client.join(this.userRoom(userId));
      this.logger.debug(`Notification client connected: user=${userId}`);
    } catch {
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: Socket) {
    const userId = (client as any).data?.userId;
    if (userId) {
      this.logger.debug(`Notification client disconnected: user=${userId}`);
    }
  }

  /**
   * Push a notification to a specific user (all their connected tabs/devices).
   */
  emitToUser(userId: string, notification: any) {
    this.server.to(this.userRoom(userId)).emit('notification', notification);
  }
}
