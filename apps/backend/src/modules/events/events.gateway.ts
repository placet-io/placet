import { Logger } from '@nestjs/common';
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../../prisma/prisma.service';

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/ws',
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(EventsGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  handleConnection(client: Socket) {
    // Auth exclusively via handshake auth object — never from URL query params
    const token = client.handshake.auth?.token as string | undefined;

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

  // ── Client-initiated subscriptions ─────────────────────────

  @SubscribeMessage('subscribe:channel')
  async handleSubscribe(client: Socket, channelId: string) {
    const userId = (client.data as Record<string, unknown>).userId as
      | string
      | undefined;
    if (!userId) return;

    // Verify user owns the agent before allowing subscription
    const agent = await this.prisma.agent.findFirst({
      where: { id: channelId, ownerId: userId },
      select: { id: true },
    });
    if (!agent) return;

    void client.join(`channel:${channelId}`);
  }

  @SubscribeMessage('unsubscribe:channel')
  handleUnsubscribe(client: Socket, channelId: string) {
    void client.leave(`channel:${channelId}`);
  }

  @SubscribeMessage('channel:read')
  async handleChannelRead(client: Socket, channelId: string) {
    const userId = (client.data as Record<string, unknown>).userId as
      | string
      | undefined;
    if (!userId) return;

    // Verify ownership
    const agent = await this.prisma.agent.findFirst({
      where: { id: channelId, ownerId: userId },
      select: { id: true },
    });
    if (!agent) return;

    await this.prisma.channelRead.upsert({
      where: { userId_channelId: { userId, channelId } },
      update: { lastReadAt: new Date() },
      create: { userId, channelId },
    });
  }

  @SubscribeMessage('ping')
  handlePing(client: Socket) {
    client.emit('pong');
  }

  // ── Server-side emit helpers ───────────────────────────────

  emitToChannel(channelId: string, event: string, data: unknown) {
    this.server.to(`channel:${channelId}`).emit(event, data);
  }

  emitToUser(userId: string, event: string, data: unknown) {
    this.server.to(`user:${userId}`).emit(event, data);
  }
}
