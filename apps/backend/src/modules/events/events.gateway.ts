import { Logger } from '@nestjs/common';
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/ws',
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(EventsGateway.name);

  constructor(private readonly jwtService: JwtService) {}

  handleConnection(client: Socket) {
    // Verify JWT from query param or auth header
    const token =
      (client.handshake.query.token as string) ??
      (client.handshake.auth?.token as string | undefined);

    if (!token) {
      this.logger.warn(`WS connection rejected: no token (${client.id})`);
      client.disconnect(true);
      return;
    }

    try {
      const payload = this.jwtService.verify<{ sub: string }>(token);
      const userId = payload.sub;

      // Store userId on socket data for later use
      (client.data as Record<string, unknown>).userId = userId;
      void client.join(`user:${userId}`);
      this.logger.log(`Client connected: ${client.id} (user: ${userId})`);
    } catch {
      this.logger.warn(`WS connection rejected: invalid token (${client.id})`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  emitToChannel(channelId: string, event: string, data: unknown) {
    this.server.to(`channel:${channelId}`).emit(event, data);
  }

  emitToUser(userId: string, event: string, data: unknown) {
    this.server.to(`user:${userId}`).emit(event, data);
  }

  /** Subscribe a user to a channel room (called when user opens a chat) */
  subscribeToChannel(client: Socket, channelId: string) {
    void client.join(`channel:${channelId}`);
  }
}
