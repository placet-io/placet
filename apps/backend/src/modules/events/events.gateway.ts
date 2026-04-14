import { Logger } from '@nestjs/common';
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'crypto';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../../prisma/prisma.service';

function resolveWsCors(): { origin: string | string[] | boolean } {
  const env = process.env.NODE_ENV;
  if (env !== 'production') {
    return { origin: true };
  }
  const corsOrigin = process.env.CORS_ORIGIN;
  if (!corsOrigin || corsOrigin === '*') {
    return { origin: true };
  }
  return { origin: corsOrigin.split(',') };
}

@WebSocketGateway({
  cors: resolveWsCors(),
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
    const apiKey = client.handshake.auth?.apiKey as string | undefined;

    if (apiKey) {
      // Agent API key auth — resolve owner from hashed key
      void this.authenticateWithApiKey(client, apiKey);
      return;
    }

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

  private async authenticateWithApiKey(client: Socket, rawKey: string) {
    if (!rawKey.startsWith('hp_')) {
      this.logger.warn(
        `WS connection rejected: invalid API key format (${client.id})`,
      );
      client.disconnect(true);
      return;
    }

    const keyHash = createHash('sha256').update(rawKey).digest('hex');
    const apiKey = await this.prisma.apiKey.findUnique({
      where: { keyHash },
      select: { userId: true },
    });

    if (!apiKey) {
      this.logger.warn(
        `WS connection rejected: unknown API key (${client.id})`,
      );
      client.disconnect(true);
      return;
    }

    (client.data as Record<string, unknown>).userId = apiKey.userId;
    void client.join(`user:${apiKey.userId}`);
    this.logger.log(
      `Client connected via API key: ${client.id} (user: ${apiKey.userId})`,
    );
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

  // ── Agent-initiated events (forwarded to channel subscribers) ──

  @SubscribeMessage('message:delta')
  handleMessageDelta(
    client: Socket,
    data: {
      channelId: string;
      delta: string;
      streamId?: string;
      streamEnd?: boolean;
    },
  ) {
    if (!data?.channelId) return;
    this.server.to(`channel:${data.channelId}`).emit('message:delta', data);
  }

  @SubscribeMessage('message:progress')
  handleMessageProgress(
    client: Socket,
    data: { channelId: string; content: string; toolHint?: boolean },
  ) {
    if (!data?.channelId) return;
    this.server.to(`channel:${data.channelId}`).emit('message:progress', data);
  }

  // ── Server-side emit helpers ───────────────────────────────

  emitToChannel(channelId: string, event: string, data: unknown) {
    this.server.to(`channel:${channelId}`).emit(event, data);
  }

  emitToUser(userId: string, event: string, data: unknown) {
    this.server.to(`user:${userId}`).emit(event, data);
  }
}
